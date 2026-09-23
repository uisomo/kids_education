@preconcurrency import AVFoundation
import Capacitor
import Foundation
import StoreKit
import UIKit

/// Capacitor bridge for the native trainer recorder.
///
/// JS calls startPreview() once the training screen is up, startRecording()
/// when the countdown finishes, and stopRecording() with the overlay event log
/// at the end. Burn-in happens here via AVFoundation rather than ffmpeg.wasm,
/// so the returned file already has the text in it.
///
/// Events: "recordingInterrupted" `{ reason }` when the system cuts a recording
/// short (camera interrupted or failed, app sent to the background, a phone
/// call). JS still calls stopRecording(), which saves what was captured.
@objc(KarateRecorderPlugin)
public class KarateRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KarateRecorderPlugin"
    public let jsName = "KarateRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "freeDiskSpace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMusicPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playClip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSaveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markVideoSeen", returnType: CAPPluginReturnPromise),
    ]

    private let camera = CameraSession()
    private let audio = AudioController()

    // Session state. Main-actor confined: every plugin method hops to the main
    // actor before touching it (rawURL used to be written from arbitrary tasks).
    @MainActor private var rawURL: URL?
    @MainActor private var recordingActive = false
    /// stopRecording is between stopping the camera and queueing the save.
    @MainActor private var stopping = false
    @MainActor private var exportBackgrounded = false
    @MainActor private var interruptionReason: String?
    /// Host time the startRecording call reached native code. The web overlay
    /// clock starts just before that call, but video time zero is the first
    /// frame, so overlay and sound times are shifted by the difference.
    @MainActor private var recordCallHostSeconds: Double?
    private var observers: [NSObjectProtocol] = []

    /// The last video handed back to JS, kept by the start-of-session cleanup
    /// so the family can still share it.
    private static let lastFinishedKey = "KarateRecorder.lastFinishedVideo"

    private static func hostNow() -> Double {
        CMClockGetTime(CMClockGetHostTimeClock()).seconds
    }

    override public func load() {
        camera.onRecordingInterrupted = { [weak self] reason in
            Task { @MainActor in self?.reportInterruption(reason) }
        }
        audio.onInterruptionBegan = { [weak self] in
            Task { @MainActor in self?.reportInterruption("audioInterruption") }
        }
        // A save the app was killed in the middle of gets finished now.
        Task { @MainActor [weak self] in
            await self?.waitUntilActive()
            self?.resumePendingSaves()
        }
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.savingJobId != nil { self.exportBackgrounded = true }
                self.reportInterruption("background")
            }
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @MainActor
    private func reportInterruption(_ reason: String) {
        guard recordingActive, interruptionReason == nil else { return }
        interruptionReason = reason
        print("⚡️  [KarateRecorder] recording interrupted: \(reason)")
        notifyListeners("recordingInterrupted", data: ["reason": reason])
    }

    // MARK: - Preview

    @objc func startPreview(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let webView = self.webView else {
                call.reject("web view unavailable")
                return
            }
            self.removeStaleTemporaryFiles()
            do {
                try await self.camera.startPreview(under: webView)
                // After the capture session is running, so any interruption
                // voice processing causes shows up in the log against it.
                self.audio.start()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        Task { @MainActor in
            self.audio.stop()
            self.camera.stopPreview()
            self.restoreWebViewBackground()
            call.resolve()
        }
    }

    /// The preview is only transparent while the camera is up; putting the
    /// background back avoids a black web view on every other screen.
    @MainActor
    private func restoreWebViewBackground() {
        guard let webView = self.webView else { return }
        // nil, not .white: the app's own background is dark indigo, and a white
        // web view would flash between the training and done screens.
        webView.isOpaque = true
        webView.backgroundColor = nil
        webView.scrollView.backgroundColor = nil
    }

    /// At the start of a session nothing from earlier sessions is still in use
    /// except the last finished video (the done screen may still share it),
    /// videos nobody has seen yet, and saves still waiting, so every other
    /// karate-* temp file — voice tracks, raw captures, partial exports left by
    /// a crash — goes.
    @MainActor
    private func removeStaleTemporaryFiles() {
        guard !stopping, !recordingActive else { return }
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory
        var keep = Set(Self.unseenVideos().compactMap { $0["name"] as? String })
        if let last = UserDefaults.standard.string(forKey: Self.lastFinishedKey) { keep.insert(last) }
        // Captures in tmp belong to pending saves whose move out of tmp failed.
        keep.formUnion(PendingSaves.all().flatMap { [$0.rawName, $0.voiceName].compactMap { $0 } }
            .filter { $0.hasPrefix("tmp:") }.map { String($0.dropFirst(4)) })
        PendingSaves.removeOrphans(except: savingJobId)
        guard let names = try? fm.contentsOfDirectory(atPath: tmp.path) else { return }
        let stale = names.filter { $0.hasPrefix("karate-") && !keep.contains($0) }.map { tmp.appendingPathComponent($0) }
        guard !stale.isEmpty else { return }
        DispatchQueue.global(qos: .utility).async {
            for url in stale { try? fm.removeItem(at: url) }
            print("⚡️  [KarateRecorder] removed \(stale.count) old temp file(s)")
        }
    }

    // MARK: - Recording

    @objc func startRecording(_ call: CAPPluginCall) {
        let arrivedAt = Self.hostNow()
        Task { @MainActor in
            guard !self.recordingActive, !self.stopping else {
                call.reject("already recording")
                return
            }
            self.recordCallHostSeconds = arrivedAt
            self.interruptionReason = nil
            // Voice first, so its file already covers the first video frame.
            self.audio.startVoiceCapture()
            do {
                self.rawURL = try await self.camera.startRecording()
                self.recordingActive = true
                call.resolve()
            } catch {
                // Don't leave the voice file open (and the mic tapped) for a
                // recording that never started.
                if let voice = self.audio.stopVoiceCapture() {
                    try? FileManager.default.removeItem(at: voice.url)
                }
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Stops everything for a session that is being abandoned (for example
    /// startRecording failed) and deletes its temp files. Always resolves.
    @objc func cancelRecording(_ call: CAPPluginCall) {
        Task { @MainActor in
            self.recordingActive = false
            let fm = FileManager.default
            if let raw = try? await self.camera.stopRecording() {
                try? fm.removeItem(at: raw)
            }
            if let voice = self.audio.stopVoiceCapture() {
                try? fm.removeItem(at: voice.url)
            }
            if !self.stopping {
                if let raw = self.rawURL { try? fm.removeItem(at: raw) }
                self.rawURL = nil
            }
            self.audio.stopMusic()
            self.audio.stop()
            self.camera.stopPreview()
            self.restoreWebViewBackground()
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("settings unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { _ in call.resolve() }
        }
    }

    /// ★ Apple's rating sheet: five stars and a tap, no writing. The system
    /// decides whether it really appears (never to someone who already rated
    /// this version, at most three times a year), so JS only asks — see
    /// review-store.ts for when.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scenes = UIApplication.shared.connectedScenes
            guard let scene = (scenes.first { $0.activationState == .foregroundActive }
                               ?? scenes.first) as? UIWindowScene else {
                call.reject("no window scene")
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve()
        }
    }

    /// Bytes iOS would free up for something the user asked for ("important
    /// usage"), so the app can refuse a practice whose video won't fit.
    @objc func freeDiskSpace(_ call: CAPPluginCall) {
        let url = FileManager.default.temporaryDirectory
        if let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let bytes = values.volumeAvailableCapacityForImportantUsage {
            call.resolve(["bytes": Double(bytes)])
        } else {
            call.reject("free space unavailable")
        }
    }

    // MARK: - Playback

    @objc func playMusic(_ call: CAPPluginCall) {
        guard let src = call.getString("src"), let url = OverlayCompositor.bundledURL(forWebPath: src) else {
            call.reject("music file not found")
            return
        }
        do {
            try audio.playMusic(url: url, volume: Float(call.getDouble("volume") ?? 0.2))
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func setMusicPaused(_ call: CAPPluginCall) {
        audio.setMusicPaused(call.getBool("paused") ?? true)
        call.resolve()
    }

    @objc func stopMusic(_ call: CAPPluginCall) {
        audio.stopMusic()
        call.resolve()
    }

    @objc func playClip(_ call: CAPPluginCall) {
        guard let src = call.getString("src"), let url = OverlayCompositor.bundledURL(forWebPath: src) else {
            call.reject("clip audio not found")
            return
        }
        do {
            try audio.playClip(url: url, volume: Float(call.getDouble("volume") ?? 0.9))
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // MARK: - Export

    /// Keeps the app running for a while if the family switches apps during
    /// 「動画を保存中…」; without it iOS suspends the export mid-file.
    private final class BackgroundTask {
        private let lock = NSLock()
        private var id: UIBackgroundTaskIdentifier = .invalid

        @MainActor
        init(_ name: String) {
            id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
                self?.end()
            }
        }

        func end() {
            lock.lock()
            let current = id
            id = .invalid
            lock.unlock()
            guard current != .invalid else { return }
            DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(current) }
        }

        deinit { end() }
    }

    /// Video export needs the GPU and hardware encoder, which iOS can take away
    /// once the app is in the background. An export that failed that way is
    /// run again when the app comes back instead of losing the overlay/sound.
    @MainActor
    private func exportRetryingInForeground<T>(_ name: String, _ body: () async throws -> T) async throws -> T {
        exportBackgrounded = false
        do {
            let task = BackgroundTask(name)
            defer { task.end() }
            return try await body()
        } catch {
            guard exportBackgrounded || UIApplication.shared.applicationState != .active else { throw error }
            print("⚡️  [KarateRecorder] \(name) failed in the background (\(error.localizedDescription)); retrying in the foreground")
            await waitUntilActive()
            exportBackgrounded = false
            let task = BackgroundTask(name)
            defer { task.end() }
            return try await body()
        }
    }

    @MainActor
    private func waitUntilActive() async {
        guard UIApplication.shared.applicationState != .active else { return }
        // Created before any suspension point, so an activation can't slip by.
        for await _ in NotificationCenter.default.notifications(named: UIApplication.didBecomeActiveNotification) {
            break
        }
    }

    private static func shifted(_ sound: OverlayCompositor.Sound, byMs shift: Double) -> OverlayCompositor.Sound {
        switch sound {
        case let .music(ms, playing, restart, src):
            return .music(ms: max(0, ms - shift), playing: playing, restart: restart, src: src)
        case let .clip(ms, src):
            return .clip(ms: max(0, ms - shift), src: src)
        }
    }

    /// What stopRecording's JS options mean, parsed the same way for a fresh
    /// save and for one resumed from disk after the app was killed.
    private struct SaveOptions {
        var events: [OverlayCompositor.Event]
        var totalDurationMs: Double
        var streakLabel: String?
        var dateLabel: String?
        var beltLabel: String?
        var menuName: String?
        var decor: OverlayCompositor.Decor
        var menu: [OverlayCompositor.MenuItem]
        var sounds: [OverlayCompositor.Sound]
    }

    private static func parseSaveOptions(_ options: [String: Any]) -> SaveOptions {
        let menu: [OverlayCompositor.MenuItem] = (options["menu"] as? [[String: Any]] ?? []).compactMap { entry in
            guard let name = entry["name"] as? String else { return nil }
            return OverlayCompositor.MenuItem(
                name: name,
                seconds: (entry["seconds"] as? NSNumber)?.intValue ?? 0,
                isRest: (entry["kind"] as? String) == "rest",
                level: (entry["level"] as? NSNumber)?.intValue,
                gained: entry["gained"] as? Bool ?? false
            )
        }
        let rawSounds = options["sounds"] as? [[String: Any]] ?? []
        let sounds: [OverlayCompositor.Sound] = rawSounds.compactMap { entry in
            guard let t = entry["t"] as? NSNumber, let kind = entry["kind"] as? String else { return nil }
            switch kind {
            case "bgm":
                return .music(ms: t.doubleValue, playing: entry["playing"] as? Bool ?? false,
                              restart: entry["restart"] as? Bool ?? false, src: entry["src"] as? String)
            case "clip":
                guard let src = entry["src"] as? String else { return nil }
                return .clip(ms: t.doubleValue, src: src)
            default:
                return nil
            }
        }
        // Which sounds actually crossed the bridge: a clip dropped here (or never
        // sent) looks exactly like a successful mix from the JS side.
        let clipCount = sounds.filter { if case .clip = $0 { return true } else { return false } }.count
        print("⚡️  [KarateRecorder] sounds: \(rawSounds.count) received -> \(sounds.count) parsed, \(clipCount) of them clips")

        let events: [OverlayCompositor.Event] = (options["events"] as? [[String: Any]] ?? []).compactMap { entry in
            guard let t = entry["t"] as? NSNumber else { return nil }
            return OverlayCompositor.Event(t: t.doubleValue, patch: entry["patch"] as? [String: Any] ?? [:])
        }
        return SaveOptions(
            events: events,
            totalDurationMs: (options["totalDurationMs"] as? NSNumber)?.doubleValue ?? 0,
            streakLabel: options["streakLabel"] as? String,
            dateLabel: options["dateLabel"] as? String,
            beltLabel: options["beltLabel"] as? String,
            menuName: options["menuName"] as? String,
            // 家族タブで選んだ かざり. An unknown or missing value means none.
            decor: OverlayCompositor.Decor(rawValue: options["decor"] as? String ?? "") ?? .none,
            menu: menu,
            sounds: sounds
        )
    }

    /// Stops capture and hands the practice to the save queue, resolving at once
    /// with `{ jobId, rawUri }` so the done screen can play the capture while the
    /// overlay is burned in. The finished file arrives as "exportFinished".
    ///
    /// `events` is the same log the web build feeds to ffmpeg: an array of
    /// `{ t, patch }` where patch carries any of drill/seconds/cue/caption.
    @objc func stopRecording(_ call: CAPPluginCall) {
        let options = (call.options as? [String: Any]) ?? [:]
        let optionsData = (try? JSONSerialization.data(withJSONObject: options)) ?? Data("{}".utf8)

        Task { @MainActor in
            guard !self.stopping else {
                call.reject("already stopping")
                return
            }
            self.stopping = true
            self.recordingActive = false
            defer {
                self.stopping = false
                self.rawURL = nil
            }
            let fm = FileManager.default

            let raw: URL
            do {
                raw = try await self.camera.stopRecording()
            } catch {
                if let voice = self.audio.stopVoiceCapture() { try? fm.removeItem(at: voice.url) }
                call.reject(error.localizedDescription)
                return
            }
            // After the camera, so the voice also covers the last frame.
            let capture = self.audio.stopVoiceCapture()
            // A voice file that never received a buffer is no voice at all.
            let voice = (capture?.buffers ?? 0) > 0 ? capture : nil
            if let capture, voice == nil { try? fm.removeItem(at: capture.url) }

            let videoStart = self.camera.recordingStartHostSeconds
            let lead: Double = {
                guard let v = voice?.startHostSeconds, let c = videoStart else { return 0 }
                return c - v
            }()
            let shiftMs: Double = {
                guard let v = videoStart, let c = self.recordCallHostSeconds else { return 0 }
                return min(max(0, (v - c) * 1000), 5000)
            }()
            print(String(format: "⚡️  [KarateRecorder] voice starts %.0f ms before the first video frame; overlay shifted %.0f ms earlier", lead * 1000, shiftMs))

            let id = UUID().uuidString
            let rawName = PendingSaves.adopt(raw, as: "\(id)-raw.\(raw.pathExtension.isEmpty ? "mov" : raw.pathExtension)")
            let voiceName = voice.map { PendingSaves.adopt($0.url, as: "\(id)-voice.\($0.url.pathExtension)") }
            let job = PendingSave(
                id: id, rawName: rawName, voiceName: voiceName,
                voiceLeadSeconds: lead, voiceProcessing: voice?.voiceProcessing ?? false,
                shiftMs: shiftMs, options: optionsData, interruption: self.interruptionReason,
                createdAt: Date(), attempts: 0
            )
            // On disk before anything slow starts: from here a killed app
            // finishes this video on its next launch.
            PendingSaves.save(job)

            var result: JSObject = [
                "jobId": id,
                "rawUri": PendingSaves.url(rawName).absoluteString,
                "echoCancelled": self.camera.echoCancelled,
            ]
            if let reason = self.interruptionReason { result["interruption"] = reason }
            if let voice {
                result["voiceLeadMs"] = lead * 1000
                result["voiceProcessing"] = voice.voiceProcessing
                result["voicePeakDb"] = voice.peakDb
            }
            call.resolve(result)
            self.enqueueSave(job)
        }
    }

    // MARK: - Save queue

    /// Saves run one at a time, in order. A new practice may start while one
    /// is still being saved.
    @MainActor private var saveQueue: [PendingSave] = []
    @MainActor private var savingJobId: String?
    @MainActor private var saveProgress: Double = 0
    /// Saves picked up from disk at launch (the app was killed mid-save).
    @MainActor private var resumedJobIds: Set<String> = []

    /// Finished videos nobody has looked at yet — typically one whose save was
    /// finished on a later launch. JS shows them and calls markVideoSeen().
    private static let unseenKey = "KarateRecorder.unseenVideos"

    private static func unseenVideos() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: unseenKey) as? [[String: Any]] ?? []
    }

    private static func setUnseenVideos(_ list: [[String: Any]]) {
        UserDefaults.standard.set(list, forKey: unseenKey)
    }

    @MainActor
    private func resumePendingSaves() {
        let jobs = PendingSaves.all()
        guard !jobs.isEmpty else { return }
        print("⚡️  [KarateRecorder] resuming \(jobs.count) save(s) cut short last time")
        for job in jobs {
            resumedJobIds.insert(job.id)
            enqueueSave(job)
        }
    }

    @MainActor
    private func enqueueSave(_ job: PendingSave) {
        guard savingJobId != job.id, !saveQueue.contains(where: { $0.id == job.id }) else { return }
        saveQueue.append(job)
        runNextSave()
    }

    @MainActor
    private func runNextSave() {
        guard savingJobId == nil, !saveQueue.isEmpty else { return }
        var job = saveQueue.removeFirst()
        savingJobId = job.id
        saveProgress = 0
        job.attempts += 1
        PendingSaves.save(job)
        Task { @MainActor in
            let result = await self.runSave(job)
            self.savingJobId = nil
            self.notifyListeners("exportFinished", data: result)
            self.runNextSave()
        }
    }

    /// Burns and mixes one saved practice. Never throws: the worst case is the
    /// silent camera file, which is still the family's video.
    @MainActor
    private func runSave(_ job: PendingSave) async -> JSObject {
        let fm = FileManager.default
        let started = Date()
        let options = (try? JSONSerialization.jsonObject(with: job.options)) as? [String: Any] ?? [:]
        let parsed = Self.parseSaveOptions(options)
        let raw = PendingSaves.url(job.rawName)
        let shiftMs = job.shiftMs

        let events = parsed.events.map { OverlayCompositor.Event(t: max(0, $0.t - shiftMs), patch: $0.patch) }
        let totalMs = max(0, parsed.totalDurationMs - shiftMs)
        // What gets mixed back into the saved video. Voice processing strips
        // whatever the speaker played out of the voice track, so it has to be
        // added back; without processing the mic already caught it, and adding
        // it again would double it.
        //
        // Keep the countdown effects (/sounds/…) and leave the character cheer
        // voices (/characters/…) out: in the recording they talked over the child.
        let hasVoice = job.voiceName != nil
        let mixedSounds = (!hasVoice || job.voiceProcessing)
            ? parsed.sounds.filter { sound in
                switch sound {
                case .music: return true
                case let .clip(_, src): return src.hasPrefix("/sounds/")
                }
            }.map { Self.shifted($0, byMs: shiftMs) }
            : []
        let voiceTrack = job.voiceName.map {
            OverlayCompositor.VoiceTrack(url: PendingSaves.url($0), leadSeconds: job.voiceLeadSeconds)
        }

        // 「動画を仕上げ中… 42%」 on the web side.
        let jobId = job.id
        let reportProgress: (Float) -> Void = { [weak self] progress in
            self?.notifyListeners("exportProgress", data: ["jobId": jobId, "progress": Double(progress)])
            Task { @MainActor in if self?.savingJobId == jobId { self?.saveProgress = Double(progress) } }
        }

        // A save that already failed to finish twice (the app died during it)
        // skips the overlay, and after that the mix too: a lighter export that
        // succeeds beats one that crashes the app on every launch.
        let tryBurn = job.attempts <= 2
        let tryMix = job.attempts <= 3 && (voiceTrack != nil || !mixedSounds.isEmpty)
        if !tryBurn { print("⚡️  [KarateRecorder] save \(job.id) attempt \(job.attempts): skipping the overlay") }

        var exportMode = "raw"
        var soundMixed = false
        var burnError: String?
        var mixError: String?
        var output: URL?
        let out = PendingSaves.url("\(job.id)-out.mp4")
        if tryBurn {
            do {
                let result = try await self.exportRetryingInForeground("KarateRecorderBurn") {
                    try await OverlayCompositor.burn(
                        sourceURL: raw, outputURL: out, events: events, totalDurationMs: totalMs,
                        menu: parsed.menu, sounds: mixedSounds, voice: voiceTrack,
                        streakLabel: parsed.streakLabel, dateLabel: parsed.dateLabel,
                        beltLabel: parsed.beltLabel,
                        menuName: parsed.menuName, decor: parsed.decor,
                        onProgress: reportProgress
                    )
                }
                output = out
                exportMode = "burned"
                soundMixed = result.soundMixed
                mixError = result.mixError
            } catch {
                burnError = error.localizedDescription
                print("⚡️  [KarateRecorder] burn-in failed: \(error.localizedDescription)")
            }
        }
        if output == nil, tryMix {
            // Burn-in failing must never cost the family their recording: the
            // sound mix without the overlay, then the raw capture.
            do {
                let result = try await self.exportRetryingInForeground("KarateRecorderMix") {
                    try await OverlayCompositor.mixOnly(sourceURL: raw, outputURL: out, sounds: mixedSounds,
                                                        voice: voiceTrack, onProgress: reportProgress)
                }
                output = out
                exportMode = "mixed"
                soundMixed = result.soundMixed
                mixError = result.mixError
            } catch {
                mixError = error.localizedDescription
                print("⚡️  [KarateRecorder] sound-only export failed: \(error.localizedDescription)")
            }
        }

        // The finished video goes to tmp like before; the capture stays where it
        // is until the next practice, since the done screen may be playing it.
        let ext = output != nil ? "mp4" : (raw.pathExtension.isEmpty ? "mov" : raw.pathExtension)
        let final = fm.temporaryDirectory.appendingPathComponent("karate-training-\(job.id).\(ext)")
        try? fm.removeItem(at: final)
        do {
            if let output {
                try fm.moveItem(at: output, to: final)
            } else {
                try fm.copyItem(at: raw, to: final)
            }
        } catch {
            print("⚡️  [KarateRecorder] could not place the finished video: \(error.localizedDescription)")
        }
        let finalURL = fm.fileExists(atPath: final.path) ? final : (output ?? raw)
        PendingSaves.remove(job.id)
        UserDefaults.standard.set(finalURL.lastPathComponent, forKey: Self.lastFinishedKey)
        var unseen = Self.unseenVideos().filter { ($0["jobId"] as? String) != job.id }
        unseen.append(["jobId": job.id, "name": finalURL.lastPathComponent,
                       "createdAt": job.createdAt.timeIntervalSince1970 * 1000])
        Self.setUnseenVideos(Array(unseen.suffix(3)))
        print(String(format: "⚡️  [KarateRecorder] save %@ done (%@) in %.1f s, attempt %d",
                     job.id, exportMode, Date().timeIntervalSince(started), job.attempts))

        var result: JSObject = [
            "jobId": job.id,
            "uri": finalURL.absoluteString,
            "burnedIn": exportMode == "burned",
            "exportMode": exportMode,
            "soundMixed": soundMixed,
            "overlayShiftMs": shiftMs,
            "resumed": resumedJobIds.contains(job.id),
        ]
        if let burnError { result["burnError"] = burnError }
        if let mixError { result["mixError"] = mixError }
        if let reason = job.interruption { result["interruption"] = reason }
        return result
    }

    /// `{ saving: { jobId, progress, resumed } | null, unseen: [{ jobId, uri, createdAt }] }`
    /// — for the app to show a save still running or a video finished while
    /// nobody was looking (after the app was killed mid-save).
    @objc func getSaveStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            let tmp = FileManager.default.temporaryDirectory
            let unseen: [JSObject] = Self.unseenVideos().compactMap { entry in
                guard let jobId = entry["jobId"] as? String, let name = entry["name"] as? String else { return nil }
                let url = tmp.appendingPathComponent(name)
                guard FileManager.default.fileExists(atPath: url.path) else { return nil }
                return ["jobId": jobId, "uri": url.absoluteString,
                        "createdAt": (entry["createdAt"] as? NSNumber)?.doubleValue ?? 0]
            }
            var result: JSObject = ["unseen": unseen]
            if let id = self.savingJobId {
                result["saving"] = ["jobId": id, "progress": self.saveProgress,
                                    "resumed": self.resumedJobIds.contains(id)] as JSObject
            } else if let next = self.saveQueue.first {
                result["saving"] = ["jobId": next.id, "progress": 0,
                                    "resumed": self.resumedJobIds.contains(next.id)] as JSObject
            } else {
                result["saving"] = NSNull()
            }
            call.resolve(result)
        }
    }

    @objc func markVideoSeen(_ call: CAPPluginCall) {
        let jobId = call.getString("jobId")
        Self.setUnseenVideos(Self.unseenVideos().filter { ($0["jobId"] as? String) != jobId })
        call.resolve()
    }
}
