@preconcurrency import AVFoundation
import Capacitor
import Foundation
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
        CAPPluginMethod(name: "freeDiskSpace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMusicPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playClip", returnType: CAPPluginReturnPromise),
    ]

    private let camera = CameraSession()
    private let audio = AudioController()

    // Session state. Main-actor confined: every plugin method hops to the main
    // actor before touching it (rawURL used to be written from arbitrary tasks).
    @MainActor private var rawURL: URL?
    @MainActor private var recordingActive = false
    @MainActor private var exporting = false
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
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.exporting { self.exportBackgrounded = true }
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
    /// except the last finished video (the done screen may still share it), so
    /// every other karate-* temp file — voice tracks, raw captures, partial
    /// exports left by a crash — goes.
    @MainActor
    private func removeStaleTemporaryFiles() {
        guard !exporting, !recordingActive else { return }
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory
        let keep = UserDefaults.standard.string(forKey: Self.lastFinishedKey)
        guard let names = try? fm.contentsOfDirectory(atPath: tmp.path) else { return }
        let stale = names.filter { $0.hasPrefix("karate-") && $0 != keep }.map { tmp.appendingPathComponent($0) }
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
            guard !self.recordingActive, !self.exporting else {
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
            if let raw = try? await self.camera.stopRecording(), !self.exporting {
                try? fm.removeItem(at: raw)
            }
            if let voice = self.audio.stopVoiceCapture() {
                try? fm.removeItem(at: voice.url)
            }
            if !self.exporting {
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

    /// Stops capture, burns the overlay, and returns the finished file.
    ///
    /// `events` is the same log the web build feeds to ffmpeg: an array of
    /// `{ t, patch }` where patch carries any of drill/seconds/cue/caption.
    @objc func stopRecording(_ call: CAPPluginCall) {
        let rawEvents = call.getArray("events", JSObject.self) ?? []
        let totalDurationMs = call.getDouble("totalDurationMs") ?? 0
        let streakLabel = call.getString("streakLabel")
        let beltLabel = call.getString("beltLabel")
        let menu: [OverlayCompositor.MenuItem] = (call.getArray("menu", JSObject.self) ?? []).compactMap { entry in
            guard let name = entry["name"] as? String else { return nil }
            return OverlayCompositor.MenuItem(
                name: name,
                seconds: (entry["seconds"] as? NSNumber)?.intValue ?? 0,
                isRest: (entry["kind"] as? String) == "rest",
                level: (entry["level"] as? NSNumber)?.intValue,
                gained: entry["gained"] as? Bool ?? false
            )
        }
        let sounds: [OverlayCompositor.Sound] = (call.getArray("sounds", JSObject.self) ?? []).compactMap { entry in
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
        let rawSoundCount = (call.getArray("sounds", JSObject.self) ?? []).count
        let clipCount = sounds.filter { if case .clip = $0 { return true } else { return false } }.count
        print("⚡️  [KarateRecorder] sounds: \(rawSoundCount) received -> \(sounds.count) parsed, \(clipCount) of them clips")

        let rawEventList: [OverlayCompositor.Event] = rawEvents.compactMap { entry in
            guard let t = entry["t"] as? NSNumber else { return nil }
            let patch = entry["patch"] as? JSObject ?? JSObject()
            return OverlayCompositor.Event(t: t.doubleValue, patch: patch)
        }

        Task { @MainActor in
            guard !self.exporting else {
                call.reject("already saving")
                return
            }
            self.recordingActive = false
            self.exporting = true
            defer {
                self.exporting = false
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
            self.rawURL = raw
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

            let events = rawEventList.map { OverlayCompositor.Event(t: max(0, $0.t - shiftMs), patch: $0.patch) }
            let totalMs = max(0, totalDurationMs - shiftMs)
            // Voice processing keeps the music out of the voice track, so it is
            // added back at a fixed level (and with no voice at all, the music
            // is still better than a silent video). Character voices stay out of
            // the saved video: in the recording they talked over the child.
            // What gets mixed back into the saved video. Voice processing strips
            // whatever the speaker played out of the voice track, so it has to be
            // added back; without processing the mic already caught it, and adding
            // it again would double it.
            //
            // This kept ONLY .music, which silently threw away the countdown
            // 「ぷっ」「ぷーん」 as well — those are .clip sounds, the same kind as the
            // cheers. Keep the countdown effects (/sounds/…) and still leave the
            // character cheer voices (/characters/…) out: in the recording they
            // talked over the child.
            let mixedSounds = (voice == nil || voice?.voiceProcessing == true)
                ? sounds.filter { sound in
                    switch sound {
                    case .music: return true
                    case let .clip(_, src): return src.hasPrefix("/sounds/")
                    }
                }.map { Self.shifted($0, byMs: shiftMs) }
                : []
            let voiceTrack = voice.map { OverlayCompositor.VoiceTrack(url: $0.url, leadSeconds: lead) }

            // Burn-in failing must never cost the family their recording: try
            // the sound mix without the overlay, then the raw capture.
            var finalURL = raw
            var exportMode = "raw"
            var soundMixed = false
            var burnError: String?
            var mixError: String?
            let burned = fm.temporaryDirectory.appendingPathComponent("karate-training-\(UUID().uuidString).mp4")
            do {
                let result = try await self.exportRetryingInForeground("KarateRecorderBurn") {
                    try await OverlayCompositor.burn(
                        sourceURL: raw, outputURL: burned, events: events, totalDurationMs: totalMs,
                        menu: menu, sounds: mixedSounds, voice: voiceTrack,
                        badgeURL: OverlayCompositor.bundledURL(forWebPath: "/characters/alan-badge.mov"),
                        streakLabel: streakLabel, beltLabel: beltLabel
                    )
                }
                finalURL = burned
                exportMode = "burned"
                soundMixed = result.soundMixed
                mixError = result.mixError
            } catch {
                burnError = error.localizedDescription
                print("⚡️  [KarateRecorder] burn-in failed: \(error.localizedDescription)")
                if voiceTrack != nil || !mixedSounds.isEmpty {
                    let mixed = fm.temporaryDirectory.appendingPathComponent("karate-mix-\(UUID().uuidString).mp4")
                    do {
                        let result = try await self.exportRetryingInForeground("KarateRecorderMix") {
                            try await OverlayCompositor.mixOnly(sourceURL: raw, outputURL: mixed, sounds: mixedSounds, voice: voiceTrack)
                        }
                        finalURL = mixed
                        exportMode = "mixed"
                        soundMixed = result.soundMixed
                        mixError = result.mixError
                    } catch {
                        mixError = error.localizedDescription
                        print("⚡️  [KarateRecorder] sound-only export failed: \(error.localizedDescription)")
                    }
                }
            }

            if finalURL != raw { try? fm.removeItem(at: raw) }
            // The voice is inside the video now; keep it only if it isn't.
            var voiceKept = false
            if let voice {
                if soundMixed { try? fm.removeItem(at: voice.url) } else { voiceKept = true }
            }
            UserDefaults.standard.set(finalURL.lastPathComponent, forKey: Self.lastFinishedKey)

            var result: JSObject = [
                "uri": finalURL.absoluteString,
                "burnedIn": exportMode == "burned",
                "exportMode": exportMode,
                "soundMixed": soundMixed,
                "overlayShiftMs": shiftMs,
                "echoCancelled": self.camera.echoCancelled,
            ]
            if let burnError { result["burnError"] = burnError }
            if let mixError { result["mixError"] = mixError }
            if let reason = self.interruptionReason { result["interruption"] = reason }
            if let voice {
                if voiceKept { result["voiceUri"] = voice.url.absoluteString }
                result["voiceLeadMs"] = lead * 1000
                result["voiceProcessing"] = voice.voiceProcessing
                result["voicePeakDb"] = voice.peakDb
            }
            call.resolve(result)
        }
    }
}
