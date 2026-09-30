import AlanKit
@preconcurrency import AVFoundation
import AlanKit
import Capacitor
import Foundation
import LocalAuthentication
import Photos
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
/// "audioRouteChanged" `{ headphones }` when the audio output changes, so the
/// page can start or stop the 練習BGM as イヤフォン are plugged in or pulled out.
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
        CAPPluginMethod(name: "saveToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometryKind", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticateParent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMusicPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopMusic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playClip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "audioRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deferPendingSaves", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeDeferredSaves", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSaveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markVideoSeen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "motionEffectsInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "applyMotionEffects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelMotionEffects", returnType: CAPPluginReturnPromise),
    ]

    private let camera = CameraSession()
    private let audio = AudioController()

    // Session state. Main-actor confined: every plugin method hops to the main
    // actor before touching it.
    /// いま 録っている 録画の 日記（PendingSaves）の id。startRecording で つくる
    @MainActor private var recordingOpening: ApprovedOpening.Selection?
    @MainActor private var recordingJobId: String?
    /// startPreview で ページが くれた おへや・かめんの 値（録画の 日記に 書く：落ちたあとも かくす ため）
    @MainActor private var previewPrivacyJSON: [String: Any]?
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
        // A save the app was killed in the middle of gets finished now — and a
        // recording the app was killed in the middle of (its journal says "recording").
        Task { @MainActor [weak self] in
            await self?.waitUntilActive()
            await self?.adoptInterruptedRecordings()
            self?.resumePendingSaves()
        }
        // イヤフォンを抜いた/さした瞬間に BGM を止める/流せるようにする。
        // 抜けた瞬間にスピーカーから鳴り出すのを防ぐのが主目的なので、
        // 起動時の状態は JS 側が audioRoute() で読む。
        observers.append(NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(), queue: .main
        ) { [weak self] _ in
            let headphones = AudioRoute.headphonesConnected()
            print("⚡️  [KarateRecorder] audio route changed: headphones=\(headphones)")
            self?.notifyListeners("audioRouteChanged", data: ["headphones": headphones])
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if let id = self.savingJobId {
                    self.exportBackgrounded = true
                    // iOS に 止められても 「落ちた」とは かぞえない（段を 下げない）
                    PendingSaves.setInProgress(id, false)
                }
                self.reportInterruption("background")
            }
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                // もどってきた：ここから 落ちたら ほんとうに 落ちた ことに なる
                if let id = self?.savingJobId { PendingSaves.setInProgress(id, true) }
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

    /// `startPreview({ liveEffects, mode })` — `liveEffects` は稽古中に画面へ出す
    /// かざりの id（家族タブで親が選ぶ）。空か未指定なら出さないし、そのときは
    /// 解析用のカメラ出力すら足さないので負荷はゼロ。
    ///
    /// **画面だけ。保存される動画には入らない。** 保存動画のキラキラは稽古の
    /// あとに applyMotionEffects で別ファイルとして作る。
    @objc func startPreview(_ call: CAPPluginCall) {
        let livePreset = call.getString("liveEffects") ?? ""
        let mode = PracticeMode(rawValue: call.getString("mode") ?? "karate") ?? .karate
        let privacyOptions = call.getObject("privacy") as [String: Any]?
        Task { @MainActor in
            guard let webView = self.webView else {
                call.reject("web view unavailable")
                return
            }
            // まえの ページ（WebView が 読みなおされた）の 録画が まだ 回っている：
            // 「already recording」で ことわらず、止めて 保存に まわす
            if self.recordingActive || self.recordingJobId != nil, !self.stopping {
                await self.salvageRecording(reason: "pageReloaded")
            }
            await self.adoptInterruptedRecordings()
            self.previewPrivacyJSON = privacyOptions
            self.removeStaleTemporaryFiles()
            // 稽古中のキラキラが「なし」なら、解析用のカメラ出力自体を足さない。
            // どちらだったかはログに残す: 出なかったときに「選ばれていない」のか
            // 「選ばれたのに動いていない」のかを、あとから見分けられるように。
            self.camera.liveEffects = livePreset.isEmpty
                ? nil
                : LiveMotionOverlay(mode: mode, presetID: livePreset)
            print("⚡️  [MotionFX] live: \(livePreset.isEmpty ? "off" : livePreset) (\(mode.rawValue))")
            // おへや・かめん（5.16）：ページが きめた 使う 値（子どもの 好み＋おうちの人の 上書き）
            let privacy = Self.parsePrivacy(privacyOptions)
            self.camera.setPrivacy(privacy.settings, background: privacy.background, keep: privacy.keep)
            print("⚡️  [AlanPrivacy] live: room \(privacy.settings.room), face \(privacy.settings.face) (\(privacy.settings.mask.rawValue))")
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
            self.camera.liveEffects = nil
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
    /// karate-* temp file — partial exports left by a crash, ✨キラキラ copies — goes.
    ///
    /// **できあがった 動画は 写真に 保存 できた ものしか 消さない**（FinishedVideos）。
    /// 録画の 日記が もっている 生の 映像・声も 消さない。
    @MainActor
    private func removeStaleTemporaryFiles() {
        guard !stopping, !recordingActive, recordingJobId == nil else { return }
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory
        // むかしの ビルドが tmp に おいた できあがりを、iOS に 消される まえに うつす
        FinishedVideos.migrateFromTemporaryDirectory()
        var keepFinished = Set(Self.unseenVideos().compactMap { $0["name"] as? String })
        if let last = UserDefaults.standard.string(forKey: Self.lastFinishedKey) { keepFinished.insert(last) }
        FinishedVideos.removeSaved(keeping: keepFinished)
        // Captures in tmp belong to pending saves whose move out of tmp failed.
        let jobs = PendingSaves.all()
        let keepTmp = Set(jobs.flatMap { $0.fileNames }.filter { $0.hasPrefix("tmp:") }.map { String($0.dropFirst(4)) })
        let running = ([savingJobId] + saveQueue.map { $0.id }).compactMap { $0 }
        PendingSaves.removeOrphans(except: running, keeping: FinishedVideos.pendingNamesToKeep())
        // ✨キラキラ の解析結果も、元の動画が消えたら一緒に消す。
        let finishedNames = Set((try? fm.contentsOfDirectory(atPath: FinishedVideos.directory.path)) ?? [])
        MotionEffects.removeOrphanedSidecars(
            keeping: Set(keepTmp.union(finishedNames).map { ($0 as NSString).deletingPathExtension }))
        guard let names = try? fm.contentsOfDirectory(atPath: tmp.path) else { return }
        let stale = names.filter { $0.hasPrefix("karate-") && !keepTmp.contains($0) }.map { tmp.appendingPathComponent($0) }
        guard !stale.isEmpty else { return }
        DispatchQueue.global(qos: .utility).async {
            for url in stale { try? fm.removeItem(at: url) }
            print("⚡️  [KarateRecorder] removed \(stale.count) old temp file(s)")
        }
    }

    // MARK: - Recording

    /// 録画を はじめる。**生の 映像と 声は さいしょから Application Support（PendingSaves）に 書き、
    /// はじまったら すぐ 日記（state "recording"）を 書く。** 録画の とちゅうで アプリが 落ちても、
    /// つぎの 起動（か startPreview）で ふつうの 保存として ひろう。
    @objc func startRecording(_ call: CAPPluginCall) {
        let arrivedAt = Self.hostNow()
        Task { @MainActor in
            guard !self.stopping else {
                call.reject("already recording")
                return
            }
            // まえの ページの 録画が 回ったまま（WebView が 読みなおされた）：止めて 保存に まわす
            if self.recordingActive || self.recordingJobId != nil {
                await self.salvageRecording(reason: "pageReloaded")
            }
            let id = UUID().uuidString
            let openingApp = (Bundle.main.bundleIdentifier ?? "").contains("piano") ? "piano" : "karate"
            let previousKey = "opening.\(openingApp).previous"
            let previous = UserDefaults.standard.object(forKey: previousKey) as? Int
            if let choice = try? OpeningProfiles.choose(app: openingApp, recordingID: id, previous: previous) {
                self.recordingOpening = choice.selection
                UserDefaults.standard.set(choice.index, forKey: previousKey)
            } else { self.recordingOpening = nil }
            let rawName = "\(id)-raw.mov"
            let voiceName = "\(id)-voice.caf"
            self.recordCallHostSeconds = arrivedAt
            self.interruptionReason = nil
            self.recordingJobId = id
            // Voice first, so its file already covers the first video frame.
            let voiceStarted = self.audio.startVoiceCapture(to: PendingSaves.url(voiceName))
            do {
                _ = try await self.camera.startRecording(to: PendingSaves.url(rawName))
                self.recordingActive = true
                let timing = self.captureTiming(voiceStart: self.audio.currentVoiceStartHostSeconds)
                var privacy: [String: Any] = [:]
                if let json = self.previewPrivacyJSON, JSONSerialization.isValidJSONObject(["privacy": json]) {
                    privacy["privacy"] = json
                }
                var job = PendingSave(
                    id: id, rawName: rawName, voiceName: voiceStarted ? voiceName : nil,
                    voiceLeadSeconds: timing.lead, voiceProcessing: self.audio.voiceProcessing,
                    shiftMs: timing.shiftMs,
                    options: (try? JSONSerialization.data(withJSONObject: privacy)) ?? Data("{}".utf8),
                    interruption: nil, createdAt: Date(), attempts: 0, state: "recording")
                job.openingSelection = self.recordingOpening.flatMap { try? JSONEncoder().encode($0) }
                do {
                    try PendingSaves.save(job)
                } catch {
                    // 録画は つづける（ファイルは もう Application Support に ある。日記は stop で もういちど 書く）
                    print("⚡️  [KarateRecorder] recording \(id) runs without a journal for now")
                }
                call.resolve()
                // 声の さいしょの 音が まだ なら、すこし あとで 日記の ずれを なおす
                if voiceStarted, self.audio.currentVoiceStartHostSeconds == nil {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    if self.recordingJobId == id, PendingSaves.load(id)?.isRecording == true,
                       let voiceStart = self.audio.currentVoiceStartHostSeconds {
                        job.voiceLeadSeconds = self.captureTiming(voiceStart: voiceStart).lead
                        try? PendingSaves.save(job)
                    }
                }
            } catch {
                // Don't leave the voice file open (and the mic tapped) for a
                // recording that never started. 何も 録れていないので 消して よい
                self.recordingJobId = nil
                let fm = FileManager.default
                if let voice = self.audio.stopVoiceCapture() {
                    try? fm.removeItem(at: voice.url)
                }
                try? fm.removeItem(at: PendingSaves.url(rawName))
                PendingSaves.remove(id)
                call.reject(error.localizedDescription)
            }
        }
    }

    /// 声と 映像が それぞれ 何秒 ずれているか（stopRecording と 録画の 日記で おなじ 計算）
    @MainActor
    private func captureTiming(voiceStart: Double?) -> (lead: Double, shiftMs: Double) {
        let videoStart = camera.recordingStartHostSeconds
        let lead: Double = {
            guard let v = voiceStart, let c = videoStart else { return 0 }
            return c - v
        }()
        let shiftMs: Double = {
            guard let v = videoStart, let c = recordCallHostSeconds else { return 0 }
            return min(max(0, (v - c) * 1000), 5000)
        }()
        return (lead, shiftMs)
    }

    /// Stops everything for a session that is being abandoned (for example
    /// startRecording failed). Always resolves.
    ///
    /// 録画が もう 回っていたら（1秒 以上 見られる 映像が あれば）消さずに 保存に まわす：
    /// 子どもの 稽古を なくさない。何も 録れていなければ 消す。
    @objc func cancelRecording(_ call: CAPPluginCall) {
        Task { @MainActor in
            if !self.stopping, self.recordingActive || self.recordingJobId != nil {
                await self.salvageRecording(reason: "cancelled", minSeconds: 1)
            } else if !self.stopping {
                // 録画は ない：開いたままの 声の ファイルだけ（どの 日記も もっていなければ）消す
                if let voice = self.audio.stopVoiceCapture() {
                    let owned = PendingSaves.all().contains { $0.fileNames.contains(voice.url.lastPathComponent) }
                    if !owned { try? FileManager.default.removeItem(at: voice.url) }
                }
            }
            self.audio.stopMusic()
            self.audio.stop()
            self.camera.stopPreview()
            self.camera.liveEffects = nil
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

    /// 「⬇ 動画を保存」: writes the finished video straight into the phone's
    /// own 写真 library. Nothing leaves the device, so no parental gate is
    /// involved — the share sheet, which *can* send the video anywhere, is the
    /// separate 「LINE・SNSで送る」 button a parent turns on in the 家族 tab.
    ///
    /// Rejects with code "denied" when the family refused photo access, so JS
    /// can offer iOS Settings instead of a bare error.
    @objc func saveToPhotos(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri") else {
            call.reject("no video to save")
            return
        }
        // fileUri comes over the bridge as file:///…, but accept a bare path.
        let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
        guard FileManager.default.fileExists(atPath: url.path) else {
            call.reject("video file missing")
            return
        }
        // Add-only: the app never gets to read the family's other photos.
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("photo library permission denied", "denied")
                return
            }
            PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil)
            } completionHandler: { ok, error in
                if ok {
                    // 写真に 入った：ここで はじめて 片づけて よい しるしを つける（つぎの 稽古の まえに 片づく）
                    if let name = FinishedVideos.contains(url) { FinishedVideos.markSaved(name) }
                    call.resolve()
                } else {
                    call.reject(error?.localizedDescription ?? "saving to 写真 failed")
                }
            }
        }
    }

    // MARK: - ✨キラキラ（動きのエフェクト）

    /// この iPhone でキラキラを付けられるか、と選べるかざりの一覧。
    /// iOS 16 以下では available=false で、JS はボタンを出さない。
    @objc func motionEffectsInfo(_ call: CAPPluginCall) {
        guard MotionEffects.isSupported else {
            call.resolve(["available": false, "presets": [] as [Any]])
            return
        }
        let mode = PracticeMode(rawValue: call.getString("mode") ?? "karate") ?? .karate
        call.resolve([
            "available": true,
            "presets": MotionEffects.presets(for: mode),
        ])
    }

    /// 仕上がった動画を読んで、かざりを乗せた **別の** mp4 を作る。元の動画は
    /// そのまま残る（JS が「もとの動画」に戻せるのはそのため）。
    ///
    /// 進み具合は "motionEffectsProgress" `{ phase, progress }` で流す。
    /// phase は "analyzing"（動きを見ているところ）か "exporting"（書き出し）。
    @objc func applyMotionEffects(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *), MotionEffects.isSupported else {
            call.reject(MotionEffects.EffectsError.unsupportedOS.localizedDescription, "unsupported")
            return
        }
        guard let uri = call.getString("uri") else {
            call.reject("no video to decorate")
            return
        }
        let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
        let mode = PracticeMode(rawValue: call.getString("mode") ?? "karate") ?? .karate
        let presetID = call.getString("preset") ?? MotionEffects.defaultPresetID[mode] ?? "kiBlue"
        let intensity = call.getDouble("intensity") ?? 1

        Task { @MainActor in
            // 書き出しは GPU とハードウェアエンコーダを使う。家族がアプリを
            // 離れても途中で切られないように、保存と同じ扱いにする。
            do {
                let output = try await self.exportRetryingInForeground("KarateRecorderMotionFX") {
                    try await MotionEffects.apply(
                        sourceURL: url, mode: mode, presetID: presetID, intensity: intensity,
                        onProgress: { [weak self] phase, fraction in
                            self?.notifyListeners("motionEffectsProgress",
                                                  data: ["phase": phase, "progress": fraction])
                        }
                    )
                }
                call.resolve(["uri": output.absoluteString])
            } catch is CancellationError {
                call.reject("cancelled", "cancelled")
            } catch {
                print("⚡️  [MotionFX] failed: \(error.localizedDescription)")
                call.reject(error.localizedDescription)
            }
        }
    }

    /// 「やめる」。書き出し途中のファイルは消され、元の動画は触られていない。
    @objc func cancelMotionEffects(_ call: CAPPluginCall) {
        Task {
            await MotionEffects.cancel()
            call.resolve()
        }
    }

    // MARK: - おうちの人のロック

    /// Which biometry this iPhone has, so the gate can say 「Face ID」 or
    /// 「指紋（Touch ID）」 rather than guessing: "faceId", "touchId",
    /// "opticId" or "none" (no sensor, none enrolled, or locked out).
    @objc func biometryKind(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        // Biometrics only — never .deviceOwnerAuthentication, which falls back
        // to the device passcode. On a family iPhone the child usually knows
        // the passcode, so that fallback would hand them the gate. When the
        // sensor can't be used the app asks for the parent's PIN instead.
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            call.resolve(["kind": "none"])
            return
        }
        switch context.biometryType {
        case .faceID: call.resolve(["kind": "faceId"])
        case .touchID: call.resolve(["kind": "touchId"])
        default:
            if #available(iOS 17.0, *), context.biometryType == .opticID {
                call.resolve(["kind": "opticId"])
            } else {
                call.resolve(["kind": "none"])
            }
        }
    }

    /// Face ID / Touch ID for the parental gate — the shortcut a parent turns
    /// on only after saying this iPhone is theirs. Resolves { ok } rather than
    /// rejecting on a failed or cancelled check, so JS just falls back to the
    /// PIN box.
    @objc func authenticateParent(_ call: CAPPluginCall) {
        let context = LAContext()
        // No 「パスコードを使用」 button: the PIN in the app is the fallback.
        context.localizedFallbackTitle = ""
        let reason = call.getString("reason") ?? "おうちの人かどうかを確認します"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            call.resolve(["ok": false, "available": false])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, _ in
            call.resolve(["ok": ok, "available": true])
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

    /// `audioRoute()` — 練習BGM を流していいか（イヤフォンかどうか）。
    @objc func audioRoute(_ call: CAPPluginCall) {
        call.resolve(["headphones": AudioRoute.headphonesConnected()])
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
    ///
    /// バックグラウンドで 失敗した ぶんは 何回でも（回数の 上限なし）アプリに もどってから やりなおす。
    /// それは 「失敗」と かぞえず、段も 下げない（iOS に GPU を とられた だけ）。
    @MainActor
    private func exportRetryingInForeground<T>(_ name: String, _ body: () async throws -> T) async throws -> T {
        while true {
            exportBackgrounded = false
            do {
                let task = BackgroundTask(name)
                defer { task.end() }
                return try await body()
            } catch {
                if error is CancellationError { throw error }
                guard exportBackgrounded || UIApplication.shared.applicationState != .active else { throw error }
                print("⚡️  [KarateRecorder] \(name) failed in the background (\(error.localizedDescription)); retrying in the foreground")
                await waitUntilActive()
            }
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
        /// 🎬 えんしゅつ（SERIES_GUIDE 5.14）。こなければ nil（いままでと おなじ）
        var viralFX: ViralFXSettings?
        /// 動画の 左上の しるし「アランの空手」「アランのピアノ」
        var brandName: String?
    }

    /// ページの `{ room, face, mask, background?, keep? }`。background は web の パス（/alan/privacy/…）、
    /// keep は 人の ほかに のこす かたち `[[x, y], …]`（0〜1、うつっている 絵で）
    static func parsePrivacy(_ json: [String: Any]?) -> (settings: PrivacySettings, background: CGImage?, keep: [CGPoint]?) {
        guard let json else { return (PrivacySettings(), nil, nil) }
        let settings = PrivacySettings(json: json)
        let background: CGImage? = (json["background"] as? String)
            .flatMap { OverlayCompositor.bundledURL(forWebPath: $0) }
            .flatMap { UIImage(contentsOfFile: $0.path)?.cgImage }
        let keep = (json["keep"] as? [[Any]])?.compactMap { p -> CGPoint? in
            guard p.count == 2, let x = (p[0] as? NSNumber)?.doubleValue, let y = (p[1] as? NSNumber)?.doubleValue else { return nil }
            return CGPoint(x: x, y: y)
        }
        return (settings, background, keep.flatMap { $0.count >= 3 ? $0 : nil })
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
            sounds: sounds,
            viralFX: (options["viralfx"] as? [String: Any]).map { ViralFXSettings(json: $0) },
            brandName: options["brandName"] as? String
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
            defer { self.stopping = false }
            let id = self.recordingJobId ?? UUID().uuidString
            self.recordingJobId = nil

            var stopError: Error?
            var raw: URL?
            do {
                raw = try await self.camera.stopRecording()
            } catch {
                stopError = error
            }
            // After the camera, so the voice also covers the last frame.
            let capture = self.audio.stopVoiceCapture()
            guard let job = await self.finishCapture(id: id, raw: raw, capture: capture, optionsData: optionsData,
                                                     interruption: self.interruptionReason, minSeconds: 0) else {
                call.reject(stopError?.localizedDescription ?? "recording unusable")
                return
            }

            var result: JSObject = [
                "jobId": id,
                "echoCancelled": self.camera.echoCancelled,
            ]
            // おへや・かめんが オンなら、かくす まえの 動画は ページに わたさない
            // （できあがりまで 待つ。生の ファイルは 写真に 保存 できるまで アプリの 中に のこる）
            let saved = (try? JSONSerialization.jsonObject(with: job.options)) as? [String: Any] ?? options
            if Self.parsePrivacy(saved["privacy"] as? [String: Any]).settings.isOn {
                result["privacyPending"] = true
            } else {
                let rawURL = PendingSaves.url(job.rawName)
                var previewURL = rawURL
                if let voiceName = job.voiceName {
                    let preview = FileManager.default.temporaryDirectory.appendingPathComponent("\(id)-preview.mov")
                    do {
                        try await OverlayCompositor.remux(sourceURL: rawURL, outputURL: preview,
                            voice: .init(url: PendingSaves.url(voiceName), leadSeconds: job.voiceLeadSeconds))
                        previewURL = preview
                    } catch {
                        print("[KarateRecorder] voice preview unavailable: \(error)")
                    }
                }
                result["rawUri"] = previewURL.absoluteString
            }
            if let reason = self.interruptionReason { result["interruption"] = reason }
            if job.voiceName != nil, let capture {
                result["voiceLeadMs"] = job.voiceLeadSeconds * 1000
                result["voiceProcessing"] = capture.voiceProcessing
                result["voicePeakDb"] = capture.peakDb
            }
            call.resolve(result)
            self.enqueueSave(job)
        }
    }

    /// 録画が おわった（stop・ページの 読みなおし・cancel）：日記を「録画ずみ」に して かえす。
    /// 見られる 映像が ない（`minSeconds` より みじかい）ときだけ ファイルと 日記を 消して nil
    @MainActor
    private func finishCapture(id: String, raw: URL?, capture: AudioController.VoiceCapture?, optionsData: Data?,
                               interruption: String?, minSeconds: Double) async -> PendingSave? {
        let fm = FileManager.default
        let journal = PendingSaves.load(id)
        let rawURL = raw ?? journal.map { PendingSaves.url($0.rawName) }
        func discard() {
            if let rawURL { try? fm.removeItem(at: rawURL) }
            if let capture { try? fm.removeItem(at: capture.url) }
            if let journal { journal.fileNames.forEach { try? fm.removeItem(at: PendingSaves.url($0)) } }
            PendingSaves.remove(id)
        }
        guard let rawURL, fm.fileExists(atPath: rawURL.path) else {
            print("⚡️  [KarateRecorder] recording \(id) left no file")
            discard()
            return nil
        }
        // usable でない（エラーで おわった）ファイルも、見られる ところまでは のこす
        guard let seconds = await VideoCheck.videoSeconds(rawURL), seconds >= minSeconds else {
            print("⚡️  [KarateRecorder] recording \(id) has no playable video; discarding it")
            discard()
            return nil
        }
        let ext = rawURL.pathExtension.isEmpty ? "mov" : rawURL.pathExtension
        let rawName = PendingSaves.adopt(rawURL, as: "\(id)-raw.\(ext)")
        // A voice file that never received a buffer is no voice at all.
        let voice = (capture?.buffers ?? 0) > 0 ? capture : nil
        if let capture, voice == nil { try? fm.removeItem(at: capture.url) }
        let voiceName = voice.map { PendingSaves.adopt($0.url, as: "\(id)-voice.\($0.url.pathExtension)") }
        let timing = captureTiming(voiceStart: voice?.startHostSeconds)
        print(String(format: "⚡️  [KarateRecorder] %.1f s recorded; voice starts %.0f ms before the first video frame; overlay shifted %.0f ms earlier",
                     seconds, timing.lead * 1000, timing.shiftMs))

        var job = journal ?? PendingSave(
            id: id, rawName: rawName, voiceName: nil, voiceLeadSeconds: 0, voiceProcessing: false,
            shiftMs: 0, options: Data("{}".utf8), interruption: nil, createdAt: Date(), attempts: 0)
        if job.openingSelection == nil { job.openingSelection = recordingOpening.flatMap { try? JSONEncoder().encode($0) } }
        job.rawName = rawName
        job.voiceName = voiceName
        job.voiceLeadSeconds = timing.lead
        job.voiceProcessing = voice?.voiceProcessing ?? false
        job.shiftMs = timing.shiftMs
        // 日記が ない（書けなかった）ときも おへや・かめんは わすれない（生の 顔を 出さない）
        if let optionsData {
            job.options = optionsData
            // ページが privacy を 送らなくても、録画を はじめた ときの 値（日記）を のこす
            if var fresh = (try? JSONSerialization.jsonObject(with: optionsData)) as? [String: Any], fresh["privacy"] == nil,
               let started = journal.flatMap({ (try? JSONSerialization.jsonObject(with: $0.options)) as? [String: Any] })?["privacy"] {
                fresh["privacy"] = started
                if JSONSerialization.isValidJSONObject(fresh), let merged = try? JSONSerialization.data(withJSONObject: fresh) {
                    job.options = merged
                }
            }
        } else if journal == nil, let privacy = previewPrivacyJSON,
                  JSONSerialization.isValidJSONObject(["privacy": privacy]) {
            job.options = (try? JSONSerialization.data(withJSONObject: ["privacy": privacy])) ?? job.options
        }
        job.interruption = interruption
        job.state = nil
        // On disk before anything slow starts: from here a killed app
        // finishes this video on its next launch. 書けなくても 何も 消さない
        // （ファイルは もう pending に あり、録画中の 日記が のこっていれば それが ひろう）
        do { try PendingSaves.save(job) } catch { print("⚡️  [KarateRecorder] save \(id) is only queued in memory") }
        return job
    }

    /// まだ 回っている 録画を 止めて、ふつうの 保存に まわす（ページの 読みなおし・cancel）
    @MainActor
    private func salvageRecording(reason: String, minSeconds: Double = 0) async {
        guard !stopping else { return }
        stopping = true
        recordingActive = false
        defer { stopping = false }
        let id = recordingJobId ?? UUID().uuidString
        recordingJobId = nil
        let raw = try? await camera.stopRecording()
        let capture = audio.stopVoiceCapture()
        guard let job = await finishCapture(id: id, raw: raw, capture: capture, optionsData: nil,
                                            interruption: interruptionReason ?? reason, minSeconds: minSeconds) else { return }
        print("⚡️  [KarateRecorder] recording \(id) was still running (\(reason)); saving it")
        // あたらしい ページには 待っている 人が いないので、おわったら「見ていない 動画」として 出す
        resumedJobIds.insert(job.id)
        enqueueSave(job)
    }

    /// 日記が "recording" のまま（録画の とちゅうで アプリが 落ちた）：見られる 映像が あれば ふつうの 保存に
    @MainActor
    private func adoptInterruptedRecordings() async {
        let fm = FileManager.default
        guard !stopping else { return }
        for var job in PendingSaves.all() where job.isRecording && job.id != recordingJobId {
            let seconds = await VideoCheck.videoSeconds(PendingSaves.url(job.rawName))
            // しらべて いる あいだに 録画・stop が はじまったら さわらない
            guard !stopping, job.id != recordingJobId, PendingSaves.load(job.id)?.isRecording == true else { continue }
            guard let seconds else {
                print("⚡️  [KarateRecorder] interrupted recording \(job.id) has no playable video; discarding it")
                job.fileNames.forEach { try? fm.removeItem(at: PendingSaves.url($0)) }
                PendingSaves.remove(job.id)
                continue
            }
            if let voice = job.voiceName, !fm.fileExists(atPath: PendingSaves.url(voice).path) { job.voiceName = nil }
            job.state = nil
            job.interruption = job.interruption ?? "appClosed"
            do { try PendingSaves.save(job) } catch { print("⚡️  [KarateRecorder] could not update journal \(job.id)") }
            print(String(format: "⚡️  [KarateRecorder] recovered %.1f s of a recording cut short (%@)", seconds, job.id))
            resumedJobIds.insert(job.id)
            enqueueSave(job)
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
    /// **これは おしらせの ためだけ。** ここから はずれても 動画は 消えない（FinishedVideos）
    private static let unseenKey = "KarateRecorder.unseenVideos"

    private static func unseenVideos() -> [[String: Any]] {
        UserDefaults.standard.array(forKey: unseenKey) as? [[String: Any]] ?? []
    }

    private static func setUnseenVideos(_ list: [[String: Any]]) {
        UserDefaults.standard.set(list, forKey: unseenKey)
    }

    @MainActor
    private func resumePendingSaves() {
        let jobs = PendingSaves.all().filter { !$0.isRecording && $0.state != "broken" }
        guard !jobs.isEmpty else { return }
        print("⚡️  [KarateRecorder] resuming \(jobs.count) save(s) cut short last time")
        for job in jobs {
            resumedJobIds.insert(job.id)
            enqueueSave(job)
        }
    }

    @MainActor
    private func enqueueSave(_ job: PendingSave) {
        guard !DeferredVideoJobs.contains(job.id) else { return }
        guard savingJobId != job.id, !saveQueue.contains(where: { $0.id == job.id }) else { return }
        saveQueue.append(job)
        runNextSave()
    }

    @MainActor
    private func runNextSave() {
        saveQueue.removeAll { DeferredVideoJobs.contains($0.id) }
        guard savingJobId == nil, !saveQueue.isEmpty else { return }
        var job = saveQueue.removeFirst()
        savingJobId = job.id
        saveProgress = 0
        // まえの 書き出しが とちゅうの まま（バックグラウンドにも 行かず）おわった＝アプリが 落ちた。
        // それだけを かぞえる（つぎは 軽い 段から）
        if job.inProgress == true {
            job.attempts += 1
            print("⚡️  [KarateRecorder] save \(job.id) crashed last time (\(job.attempts) so far)")
        }
        persist(&job)
        Task { @MainActor in
            let result = await self.runSave(job)
            self.savingJobId = nil
            self.notifyListeners("exportFinished", data: result)
            self.runNextSave()
        }
    }

    /// 日記を 書く。`inProgress` は いま 前に いるか どうか（うしろに いる ときの 失敗は 落ちたと かぞえない）
    @MainActor
    private func persist(_ job: inout PendingSave, inProgress: Bool? = nil) {
        job.inProgress = inProgress ?? (UIApplication.shared.applicationState == .active)
        do { try PendingSaves.save(job) } catch { print("⚡️  [KarateRecorder] journal for \(job.id) not updated") }
    }

    /// のこった まま（まだ 保存を まっている）の 答え。ファイルは ひとつも 消さない
    @MainActor
    private func keepPending(_ job: PendingSave, mode: String, error: String) -> JSObject {
        var job = job
        persist(&job, inProgress: false)
        print("⚡️  [KarateRecorder] save \(job.id) kept for later (\(mode)): \(error)")
        return ["jobId": job.id, "uri": "", "burnedIn": false, "exportMode": mode, "error": error,
                "resumed": resumedJobIds.contains(job.id)]
    }

    /// Burns and mixes one saved practice. 段を 下へ：文字＋音 → 音だけ → 生の 映像＋声（再エンコードなし）
    /// → 生の 映像だけ（声が 読めないときだけ）。どの 段も できた 動画を VideoCheck で たしかめてから つかう。
    /// できた 動画が Application Support に 入って たしかめられるまで、日記も 生の ファイルも 消さない。
    @MainActor
    private func deferredResult(_ original: PendingSave) -> JSObject {
        var job = original
        job.attempts = max(0, job.attempts - 1)
        job.inProgress = false
        try? PendingSaves.save(job)
        return ["jobId": job.id, "pending": true, "deferred": true, "uri": "", "exportMode": "deferred"]
    }

    @MainActor
    private func runSave(_ job: PendingSave) async -> JSObject {
        if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
        var job = job
        let fm = FileManager.default
        let started = Date()
        let options = (try? JSONSerialization.jsonObject(with: job.options)) as? [String: Any] ?? [:]
        let parsed = Self.parseSaveOptions(options)
        var raw = PendingSaves.url(job.rawName)
        let shiftMs = job.shiftMs
        let jobId = job.id

        guard await VideoCheck.videoSeconds(raw) != nil else {
            // 映像が 読めない：消さずに よけておく（つぎの 起動で くりかえさない）
            job.state = "broken"
            return keepPending(job, mode: "failed", error: "capture unreadable")
        }

        // おへや・かめん（5.16）：**いちばん はじめに** かくした 動画を つくる。
        // このあとの しあげ（文字・音）と その予備（音だけ・そのまま）は ぜんぶ かくした 動画から なので、
        // どの 道に 行っても 顔と 部屋は 出ない。かくせなかったら 保存しない（生の ファイルは のこす）。
        // 段：full → reduced → wholeFrame（Vision なし・画面ぜんぶ ぼかす）。落ちた 回数 だけ 下から はじめる
        let privacy = Self.parsePrivacy(options["privacy"] as? [String: Any])
        var privacyShare: Float = 0
        if privacy.settings.isOn, !job.privacyDone {
            privacyShare = 0.5
            let privateName = "\(job.id)-private.mp4"
            var level = PrivacyLevel.forAttempt(job.attempts + 1)
            var privacyError: String?
            while true {
                do {
                    let source = raw
                    let current = level
                    _ = try await self.exportRetryingInForeground("KarateRecorderPrivacy") {
                        try await PrivacyExport.export(
                            source: source, to: PendingSaves.url(privateName), settings: privacy.settings,
                            background: privacy.background, keep: privacy.keep, level: current,
                            onProgress: { [weak self] p in
                                self?.notifyListeners("exportProgress", data: ["jobId": jobId, "progress": Double(p * 0.5)])
                            })
                    }
                    privacyError = nil
                    break
                } catch {
                if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
                    privacyError = error.localizedDescription
                    print("⚡️  [AlanPrivacy] save \(job.id) could not hide the room/face at \(level.rawValue): \(error.localizedDescription)")
                    if level == .wholeFrame { break }
                    level = level.next
                }
            }
            if let privacyError {
                // 生の 映像は 出さない。消しも しない（つぎに また）
                var result = keepPending(job, mode: "privacyFailed", error: privacyError)
                result["privacyError"] = privacyError
                return result
            }
            print("⚡️  [AlanPrivacy] save \(job.id) hidden at \(level.rawValue)")
            job.originalRawName = job.rawName
            job.rawName = privateName
            job.attempts = 0   // しあげの 段は また いちばん 上から
            persist(&job)
            raw = PendingSaves.url(privateName)
        } else if job.privacyDone {
            privacyShare = 0.5
        }
        var expected = await VideoCheck.videoSeconds(raw)

        let events = parsed.events.map { OverlayCompositor.Event(t: max(0, $0.t - shiftMs), patch: $0.patch) }
        let totalMs = max(0, parsed.totalDurationMs - shiftMs)
        // What gets mixed back into the saved video. Voice processing strips
        // whatever the speaker played out of the voice track, so it has to be
        // added back; without processing the mic already caught it, and adding
        // it again would double it.
        //
        // Keep the countdown effects (/sounds/…) and leave the character cheer
        // voices (/characters/…) out: in the recording they talked over the child.
        let voiceURL = job.voiceName.map { PendingSaves.url($0) }.flatMap { fm.fileExists(atPath: $0.path) ? $0 : nil }
        let hasVoice = voiceURL != nil
        let mixedSounds = (!hasVoice || job.voiceProcessing)
            ? parsed.sounds.filter { sound in
                switch sound {
                case .music: return true
                case let .clip(_, src): return src.hasPrefix("/sounds/")
                }
            }.map { Self.shifted($0, byMs: shiftMs) }
            : []
        let voiceTrack = voiceURL.map { OverlayCompositor.VoiceTrack(url: $0, leadSeconds: job.voiceLeadSeconds) }

        // 「動画を仕上げ中… 42%」 on the web side. かくす 書き出しを したら、その あとの 半分。
        let reportProgress: (Float) -> Void = { [weak self] raw in
            let progress = privacyShare + raw * (1 - privacyShare)
            self?.notifyListeners("exportProgress", data: ["jobId": jobId, "progress": Double(progress)])
            Task { @MainActor in if self?.savingJobId == jobId { self?.saveProgress = Double(progress) } }
        }

        // A save that already crashed the app twice skips the overlay, and after
        // that the mix too: a lighter export that succeeds beats one that
        // crashes the app on every launch. (バックグラウンドの 失敗は かぞえない)
        let tryBurn = job.attempts < 2
        let tryMix = job.attempts < 3 && (voiceTrack != nil || !mixedSounds.isEmpty)
        if !tryBurn { print("⚡️  [KarateRecorder] save \(job.id) after \(job.attempts) crash(es): skipping the overlay") }
        // 🎬 えんしゅつは 1回めだけ。人の 切りぬき（Vision）は おもいので、とちゅうで アプリが
        // 落ちたら 2回めは いままでの 文字だけに する（動画を なくさない ことが いちばん）
        let viralFX = job.attempts == 0 ? parsed.viralFX : nil
        if parsed.viralFX != nil, viralFX == nil {
            print("⚡️  [KarateRecorder] save \(job.id) attempt \(job.attempts): skipping viralfx")
        }

        var exportMode = "raw"
        var soundMixed = false
        var burnError: String?
        var mixError: String?
        var output: URL?
        let out = PendingSaves.url("\(job.id)-out.mp4")
        let source = raw
        if tryBurn {
            do {
                let result = try await self.exportRetryingInForeground("KarateRecorderBurn") {
                    try await OverlayCompositor.burn(
                        sourceURL: source, outputURL: out, events: events, totalDurationMs: totalMs,
                        menu: parsed.menu, sounds: mixedSounds, voice: voiceTrack,
                        streakLabel: parsed.streakLabel, dateLabel: parsed.dateLabel,
                        beltLabel: parsed.beltLabel,
                        menuName: parsed.menuName, decor: parsed.decor,
                        viralFX: viralFX, brandName: parsed.brandName,
                        onProgress: reportProgress
                    )
                }
                try await VideoCheck.validate(out, expectedSeconds: expected)
                output = out
                exportMode = "burned"
                soundMixed = result.soundMixed
                mixError = result.mixError
                // 📸 写真の ストップの コマを 写真へ（設定で「しゃしん」が オンのとき）
                KarateViralFX.saveStills(result.stills)
            } catch {
                if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
                burnError = error.localizedDescription
                try? fm.removeItem(at: out)
                print("⚡️  [KarateRecorder] burn-in failed: \(error.localizedDescription)")
            }
        }
        if output == nil, tryMix {
            // Burn-in failing must never cost the family their recording: the
            // sound mix without the overlay, then the raw capture with its voice.
            do {
                let result = try await self.exportRetryingInForeground("KarateRecorderMix") {
                    try await OverlayCompositor.mixOnly(sourceURL: source, outputURL: out, sounds: mixedSounds,
                                                        voice: voiceTrack, onProgress: reportProgress)
                }
                try await VideoCheck.validate(out, expectedSeconds: expected)
                output = out
                exportMode = "mixed"
                soundMixed = result.soundMixed
                mixError = result.mixError
            } catch {
                if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
                mixError = error.localizedDescription
                try? fm.removeItem(at: out)
                print("⚡️  [KarateRecorder] sound-only export failed: \(error.localizedDescription)")
            }
        }
        if output == nil, let voiceTrack {
            // さいごの 段：生の 映像＋声を そのまま（再エンコードなし・こわれにくい）
            let remuxed = PendingSaves.url("\(job.id)-remux.mov")
            do {
                try await self.exportRetryingInForeground("KarateRecorderRemux") {
                    try await OverlayCompositor.remux(sourceURL: source, outputURL: remuxed, voice: voiceTrack)
                }
                try await VideoCheck.validate(remuxed, expectedSeconds: expected)
                output = remuxed
                exportMode = "remuxed"
                soundMixed = true
            } catch {
                if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
                try? fm.removeItem(at: remuxed)
                print("⚡️  [KarateRecorder] remux with the voice failed: \(error.localizedDescription)")
            }
        }

        // Common opening consumes the privacy-resolved source and the already decorated body.
        // Failure/insufficient meaningful scenes keeps that finished body, never reopens originalRawName.
        var openingStatus = "legacy-recording"
        var openingTimeOffset: Double?
        if let data = job.openingSelection,
           let selection = try? JSONDecoder().decode(ApprovedOpening.Selection.self, from: data) {
            openingStatus = "needs-finished-body"
            if exportMode == "burned", let body = output, let duration = expected {
                do {
                    let changes = events.filter { ($0.patch["drillIndex"] as? NSNumber) != nil }
                    let candidates = changes.enumerated().compactMap { index, event -> ApprovedOpening.Candidate? in
                        guard let row = (event.patch["drillIndex"] as? NSNumber)?.intValue,
                              row >= 0, row < parsed.menu.count, !parsed.menu[row].isRest else { return nil }
                        let end = index + 1 < changes.count ? changes[index + 1].t / 1000 : duration
                        return ApprovedOpening.Candidate(id: "drill-\(row)-\(index)", start: max(0, event.t / 1000),
                            end: min(duration, end), kind: selection.app == "piano" ? "performance" : "practice",
                            child: true, privacyProcessed: !privacy.settings.isOn || job.privacyDone)
                    }
                    let highlights = try ApprovedOpening.select(app: selection.app, candidates: candidates, sourceDuration: duration)
                    let title = parsed.menu.first(where: { !$0.isRest })?.name ?? ""
                    guard let logoURL = Bundle.main.url(forResource: "decor-banner", withExtension: "png", subdirectory: "public/images"),
                          let logo = UIImage(contentsOfFile: logoURL.path)?.cgImage else {
                        throw ApprovedOpening.Failure.missingAsset("app logo")
                    }
                    let bodyStart = candidates.map(\.start).min() ?? 0
                    var openingPlan = OpeningClipPlan(selection: selection, highlights: highlights, date: job.createdAt, bodyStart: bodyStart)
                    if privacy.settings.avatar, let track = OpeningAvatarTrack.read(for: raw), track.mask == privacy.settings.mask {
                        openingPlan.avatarSegments = [.init(start: 0, track: track)]
                    }
                    let openingOut = PendingSaves.url("\(job.id)-opening.mp4")
                    try? fm.removeItem(at: openingOut)
                    // Body remains intact: existing banners, sparkles and sound all come from body.
                    try await self.exportRetryingInForeground("KarateRecorderOpening") {
                        try? fm.removeItem(at: openingOut)
                        try await openingPlan.export(finishedMovie: body, privacy: privacy.settings, logo: logo,
                                                     title: title, to: openingOut)
                    }
                    try await VideoCheck.validate(openingOut, expectedSeconds: duration - bodyStart + ApprovedOpening.duration)
                    output = openingOut
                    expected = duration - bodyStart + ApprovedOpening.duration
                    openingStatus = "ready"
                    openingTimeOffset = ApprovedOpening.duration - bodyStart - shiftMs / 1000
                } catch ApprovedOpening.Failure.needsHighlights(let available) {
                    openingStatus = "needs-highlights-\(available)"
                } catch {
                    if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
                    openingStatus = "needs-assets-or-retry"
                    print("⚡️ [Opening] \(job.id): \(error)")
                }
            }
        }

        // できあがりは Application Support/KarateRecorder/finished へ（tmp では ない）。コピーでなく 移す。
        // 生の 映像を そのまま つかう ときも 移す（そのとき 声は 写真に 保存 されるまで のこす）
        if DeferredVideoJobs.contains(job.id) { return deferredResult(job) }
        let placed = output ?? raw
        let ext = placed.pathExtension.isEmpty ? "mov" : placed.pathExtension
        let finalName = FinishedVideos.name(forJob: job.id, ext: ext)
        let final = FinishedVideos.url(finalName)
        if fm.fileExists(atPath: final.path) { try? fm.removeItem(at: final) }   // まえに とちゅうで おわった ぶん
        do {
            try fm.moveItem(at: placed, to: final)
        } catch {
            if output != nil { try? fm.removeItem(at: placed) }
            return keepPending(job, mode: "failed", error: "could not place the finished video: \(error.localizedDescription)")
        }
        do {
            try await VideoCheck.validate(final, expectedSeconds: expected)
        } catch {
            // 生の 映像を 移していたら もどす（日記が さす 場所に）
            if output == nil { try? fm.moveItem(at: final, to: placed) } else { try? fm.removeItem(at: final) }
            return keepPending(job, mode: "failed", error: "finished video failed its check: \(error.localizedDescription)")
        }

        // ここで はじめて 日記を 消せる。写真に 保存 されるまで のこす もの：かくす まえの 生の 録画、
        // 映像だけに なったときの 声
        var keepUntilSaved: [String] = []
        if let original = job.originalRawName { keepUntilSaved.append(original) }
        if output == nil, let voice = job.voiceName { keepUntilSaved.append(voice) }
        FinishedVideos.setKeepUntilSaved(finalName, keepUntilSaved)
        PendingSaves.remove(job.id)
        UserDefaults.standard.set(finalName, forKey: Self.lastFinishedKey)
        // おしらせの 一覧（3つまで）。ここから はずれても 動画は 消えない
        var unseen = Self.unseenVideos().filter { ($0["jobId"] as? String) != job.id }
        unseen.append(["jobId": job.id, "name": finalName,
                       "createdAt": job.createdAt.timeIntervalSince1970 * 1000])
        Self.setUnseenVideos(Array(unseen.suffix(3)))
        print(String(format: "⚡️  [KarateRecorder] save %@ done (%@) in %.1f s after %d crash(es)",
                     job.id, exportMode, Date().timeIntervalSince(started), job.attempts))

        var result: JSObject = [
            "jobId": job.id,
            "uri": final.absoluteString,
            "burnedIn": exportMode == "burned",
            "exportMode": exportMode,
            "soundMixed": soundMixed,
            "overlayShiftMs": shiftMs,
            "openingStatus": openingStatus,
            "resumed": resumedJobIds.contains(job.id),
        ]
        if let openingTimeOffset { result["sourceTimeOffset"] = openingTimeOffset }
        if let burnError { result["burnError"] = burnError }
        if let mixError { result["mixError"] = mixError }
        if let reason = job.interruption { result["interruption"] = reason }
        return result
    }

    /// できあがりの 動画の 場所（いまは finished/、むかしの ビルドの ものは tmp）
    private static func finishedURL(_ name: String) -> URL? {
        let fm = FileManager.default
        let finished = FinishedVideos.url(name)
        if fm.fileExists(atPath: finished.path) { return finished }
        let legacy = fm.temporaryDirectory.appendingPathComponent(name)
        return fm.fileExists(atPath: legacy.path) ? legacy : nil
    }

    /// `{ saving: { jobId, progress, resumed } | null, unseen: [{ jobId, uri, createdAt }],
    ///    unsaved: [{ jobId, uri, createdAt }] }`
    /// — for the app to show a save still running or a video finished while
    /// nobody was looking (after the app was killed mid-save). `unsaved` は
    /// まだ 写真に 保存 されていない できあがり ぜんぶ（見たか どうかに かかわらず）
    @objc func deferPendingSaves(_ call: CAPPluginCall) {
        Task { @MainActor in
            let ids = PendingSaves.all().map { $0.id } + self.saveQueue.map { $0.id } + [self.savingJobId].compactMap { $0 }
            DeferredVideoJobs.postpone(ids)
            self.saveQueue.removeAll { DeferredVideoJobs.contains($0.id) }
            // Wait for the active exporter to release memory before starting a new capture.
            for _ in 0..<80 {
                if self.savingJobId == nil { call.resolve(["deferred": true]); return }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            call.reject("動画の仕上げを停止中です。少し待ってもう一度ためしてください。")
        }
    }
    @objc func resumeDeferredSaves(_ call: CAPPluginCall) {
        Task { @MainActor in
            DeferredVideoJobs.resume(PendingSaves.all().map { $0.id })
            self.resumePendingSaves()
            call.resolve()
        }
    }

    @objc func getSaveStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            let unseen: [JSObject] = Self.unseenVideos().compactMap { entry in
                guard let jobId = entry["jobId"] as? String, let name = entry["name"] as? String,
                      let url = Self.finishedURL(name) else { return nil }
                return ["jobId": jobId, "uri": url.absoluteString,
                        "createdAt": (entry["createdAt"] as? NSNumber)?.doubleValue ?? 0]
            }
            let unsaved: [JSObject] = FinishedVideos.unsaved().map { video in
                ["jobId": FinishedVideos.jobId(of: video.name) ?? video.name, "uri": video.url.absoluteString,
                 "createdAt": video.createdAt.timeIntervalSince1970 * 1000]
            }
            var result: JSObject = ["unseen": unseen, "unsaved": unsaved]
            if let id = self.savingJobId {
                result["saving"] = ["jobId": id, "progress": self.saveProgress,
                                    "resumed": self.resumedJobIds.contains(id)] as JSObject
            } else if let next = self.saveQueue.first {
                result["saving"] = ["jobId": next.id, "progress": 0,
                                    "resumed": self.resumedJobIds.contains(next.id)] as JSObject
            } else {
                result["saving"] = NSNull()
            }
            result["deferred"] = PendingSaves.all().filter { DeferredVideoJobs.contains($0.id) }.count
            call.resolve(result)
        }
    }

    /// おしらせを もう 出さない だけ。動画は 消さない（消せるのは 写真に 保存 できた あと）
    @objc func markVideoSeen(_ call: CAPPluginCall) {
        let jobId = call.getString("jobId")
        Self.setUnseenVideos(Self.unseenVideos().filter { ($0["jobId"] as? String) != jobId })
        call.resolve()
    }
}
