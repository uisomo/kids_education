import AlanKit
@preconcurrency import AVFoundation
import UIKit
import WebKit

/// Owns the AVCaptureSession: a front-camera + microphone capture that writes
/// straight to a file via AVCaptureMovieFileOutput, with a preview layer shown
/// behind the (transparent) web view.
///
/// This replaces getUserMedia + MediaRecorder, which froze the recorded image
/// roughly 20-30s in on iOS while audio kept running. Nothing here goes through
/// WebKit's capture pipeline.
final class CameraSession: NSObject {

    enum CameraError: LocalizedError {
        case permissionDenied(String)
        case noCamera
        case notRunning
        case alreadyRecording
        case notRecording

        var errorDescription: String? {
            switch self {
            case .permissionDenied(let what): return "\(what) permission denied"
            case .noCamera: return "no front camera available"
            case .notRunning: return "preview not started"
            case .alreadyRecording: return "already recording"
            case .notRecording: return "not recording"
            }
        }
    }

    private let session = AVCaptureSession()
    private let movieOutput = AVCaptureMovieFileOutput()
    /// ✨キラキラ（稽古中・画面だけ）。nil のときは解析用の出力を足さないので、
    /// カメラにも録画にも、この機能ぶんの負荷は一切かからない。
    /// startPreview の前に入れること（セッションを組むときに見る）。
    ///
    /// 書くのは main、読むのは解析キュー（コマが届くところ）なので鍵をかける。
    /// 中身の `submit` は nonisolated で、main を待たずに戻る。
    private let liveLock = NSLock()
    private var storedLiveEffects: LiveMotionOverlay?
    var liveEffects: LiveMotionOverlay? {
        get { liveLock.lock(); defer { liveLock.unlock() }; return storedLiveEffects }
        set { liveLock.lock(); storedLiveEffects = newValue; liveLock.unlock() }
    }
    /// 解析専用の出力。`alwaysDiscardsLateVideoFrames` をここに付けるのは安全で、
    /// 録画は movieOutput が別に書いているので、取りこぼしても録画には響かない。
    private let analysisOutput = AVCaptureVideoDataOutput()
    private let analysisQueue = DispatchQueue(label: "karate.recorder.analysis", qos: .userInitiated)
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var previewView: UIView?

    /// おへや・かめん（SERIES_GUIDE 5.16、AlanKit）。画面だけ。**保存する動画は
    /// 書き出しで PrivacyExport が 焼きこむ**（ここは 見せるだけで 画素を いじらない）。
    /// 顔の 出力と 解析の コマは いつも つなぐ（トグルを かえても セッションを 組みなおさない）。
    @MainActor private var privacyOverlay: PrivacyLiveOverlay?
    @MainActor private var privacyChoice: (settings: PrivacySettings, background: CGImage?, keep: [CGPoint]?)
        = (PrivacySettings(), nil, nil)
    /// 解析の キューから よむ（main で 1回 入れたら かわらない）
    private nonisolated(unsafe) var privacyForFrames: PrivacyLiveOverlay?

    /// startPreview の 前に よぶ（録画ごと。子どもの 好みと おうちの人の 設定から きめた 値）
    @MainActor
    func setPrivacy(_ settings: PrivacySettings, background: CGImage?, keep: [CGPoint]?) {
        privacyChoice = (settings, background, keep)
        privacyOverlay?.apply(settings, background: background, keep: keep)
    }
    /// All session mutation happens here; AVCaptureSession calls block.
    private let sessionQueue = DispatchQueue(label: "karate.recorder.session")
    private var stopContinuation: CheckedContinuation<URL, Error>?

    /// Called (on an arbitrary queue) when the system cuts a recording short:
    /// the session was interrupted, hit a runtime error, or the file finished
    /// without anyone asking it to stop.
    var onRecordingInterrupted: ((String) -> Void)?

    /// Whether a recording is starting or running right now.
    var isRecording: Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        switch state {
        case .starting, .recording: return true
        case .idle, .finished: return false
        }
    }

    // MARK: - Permissions

    private static func requestAccess(for type: AVMediaType) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: type) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: type)
        default: return false
        }
    }

    // MARK: - Preview

    /// Configures the capture session and inserts the preview layer beneath
    /// `webView`, making the web view transparent so the HTML UI draws on top.
    @MainActor
    func startPreview(under webView: WKWebView) async throws {
        guard await Self.requestAccess(for: .video) else {
            throw CameraError.permissionDenied("camera")
        }
        guard await Self.requestAccess(for: .audio) else {
            throw CameraError.permissionDenied("microphone")
        }

        bumpPreviewGeneration()

        try configureAudioSession()

        // A second startPreview (the web page re-entering the training screen)
        // must not stack another preview view or rebuild a running session.
        if let existing = previewView, existing.superview != nil {
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear
            try await startRunning()
            observeSessionEvents()
            liveEffects?.start()
            privacyOverlay?.apply(privacyChoice.settings, background: privacyChoice.background, keep: privacyChoice.keep)
            return
        }
        previewView?.removeFromSuperview()

        if privacyOverlay == nil {
            let overlay = PrivacyLiveOverlay()
            privacyOverlay = overlay
            privacyForFrames = overlay
        }
        try await configureCaptureSession()

        let container = UIView(frame: webView.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.backgroundColor = .black

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = container.bounds
        // Front camera: show the child a mirror image, which is what they
        // expect from a selfie preview.
        if let connection = layer.connection, connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
        container.layer.addSublayer(layer)
        // おへや（背景は プレビューの うしろ）・かめん（プレビューの まえ）
        if let privacy = privacyOverlay {
            privacy.install(on: layer)
            privacy.apply(privacyChoice.settings, background: privacyChoice.background, keep: privacyChoice.keep)
        }

        // ✨キラキラ（稽古中）: プレビューの上、web 画面の下。タップは通す。
        if let live = liveEffects {
            live.view.frame = container.bounds
            live.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(live.view)
            live.start()
        }

        previewLayer = layer
        previewView = container

        if let parent = webView.superview {
            parent.insertSubview(container, belowSubview: webView)
        }
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        try await startRunning()
        observeSessionEvents()
    }

    /// Waits until the session is actually running. startRunning() is
    /// synchronous but was only *scheduled* here before, so startPreview()
    /// returned while the session was still spinning up. The app then called
    /// startRecording() on a session that wasn't running, AVFoundation dropped
    /// it silently, the preview appeared a moment later anyway — and nothing
    /// was ever written, so stopping failed with "not recording".
    private func startRunning() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [session] in
                if !session.isRunning { session.startRunning() }
                if session.isRunning {
                    cont.resume()
                } else {
                    cont.resume(throwing: CameraError.notRunning)
                }
            }
        }
    }

    private var observers: [NSObjectProtocol] = []

    /// Logs anything that can cut a recording short mid-session. These print to
    /// stdout next to Capacitor's own ⚡️ lines, so they show up in the device
    /// console without any extra tooling.
    private func observeSessionEvents() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil
        ) { [weak self] note in
            let error = note.userInfo?[AVCaptureSessionErrorKey] as? NSError
            print("⚡️  [KarateRecorder] capture runtime error: \(error?.localizedDescription ?? "unknown") (\(error?.code ?? 0))")
            guard let self, self.isRecording else { return }
            self.onRecordingInterrupted?("cameraError")
        })
        observers.append(center.addObserver(
            forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil
        ) { [weak self] note in
            let code = (note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber)?.intValue ?? -1
            print("⚡️  [KarateRecorder] capture interrupted, reason \(code)")
            // 止まったカメラの古いポーズが画面に残らないように。録画そのものは
            // ここでは何も変えない。
            Task { @MainActor [weak self] in self?.liveEffects?.stop() }
            guard let self, self.isRecording else { return }
            self.onRecordingInterrupted?(Self.interruptionName(code))
        })
        observers.append(center.addObserver(
            forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil
        ) { [weak self] _ in
            print("⚡️  [KarateRecorder] capture interruption ended")
            // 中断でキラキラを消しているので、カメラが戻ったら出し直す。
            // これが無いと、アプリを一瞬離れただけで、その稽古のあいだ
            // ずっと出なくなる。プレビューが畳まれていれば view が無いので、
            // start() は次の startPreview まで何もしない。
            Task { @MainActor [weak self] in
                guard let self, self.previewView?.superview != nil else { return }
                self.liveEffects?.start()
            }
        })
    }

    /// Synchronous so the lock is never held across an await.
    private func bumpPreviewGeneration() {
        stateLock.lock()
        previewGeneration += 1
        stateLock.unlock()
    }

    private static func interruptionName(_ code: Int) -> String {
        switch AVCaptureSession.InterruptionReason(rawValue: code) {
        case .videoDeviceNotAvailableInBackground: return "cameraBackground"
        case .audioDeviceInUseByAnotherClient: return "cameraAudioInUse"
        case .videoDeviceInUseByAnotherClient: return "cameraInUse"
        case .videoDeviceNotAvailableWithMultipleForegroundApps: return "cameraMultitasking"
        case .videoDeviceNotAvailableDueToSystemPressure: return "cameraSystemPressure"
        default: return "cameraInterrupted"
        }
    }

    /// The web view and the capture session both want the audio route. Mixing
    /// with others keeps the練習BGM and 掛け声 clips audible from the web layer
    /// while the microphone is live.
    /// AVAudioSession's echo-cancelled input (iOS 18.2) is only supported on some
    /// 2024 iPhones and reported unavailable on an iPhone 16, so it is no longer
    /// requested. Echo cancellation now comes from voice processing on the
    /// AudioController engine, which works on every iPhone. Stays false, so the
    /// export's sound mix is off until the separate voice track is adopted.
    private(set) var echoCancelled = false

    private func configureAudioSession() throws {
        let audio = AVAudioSession.sharedInstance()
        // .default rather than .videoRecording: AudioController enables voice
        // processing against this session.
        try audio.setCategory(
            .playAndRecord,
            mode: .default,
            options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers]
        )
        try audio.setActive(true)
    }

    private func configureCaptureSession() async throws {
        guard let camera = AVCaptureDevice.default(
            .builtInWideAngleCamera, for: .video, position: .front
        ) else {
            throw CameraError.noCamera
        }
        let privacy = privacyForFrames
        // キラキラか おへや（人の 切りぬき）が あるときだけ 解析の 出力を 足す
        let wantsAnalysis = liveEffects != nil || privacy != nil

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [session, movieOutput, analysisOutput, weak self] in
                do {
                    session.beginConfiguration()
                    // We own the audio session (configureAudioSession above);
                    // letting AVCaptureSession reset it drops .mixWithOthers
                    // and silences the web layer's BGM.
                    session.automaticallyConfiguresApplicationAudioSession = false
                    // 720p, not .high (1080p): a 3-minute practice at 1080p made
                    // a ~390 MB file and took about as long as the practice to
                    // save on an iPhone SE — long enough for the family to leave
                    // the app mid-save and for iOS to kill it. 720p roughly halves
                    // both and still looks sharp on a phone or in LINE.
                    session.sessionPreset = session.canSetSessionPreset(.hd1280x720) ? .hd1280x720 : .high

                    for input in session.inputs { session.removeInput(input) }
                    for output in session.outputs { session.removeOutput(output) }

                    let videoInput = try AVCaptureDeviceInput(device: camera)
                    if session.canAddInput(videoInput) { session.addInput(videoInput) }

                    // No microphone input: AudioController owns the mic and
                    // records the voice as its own file. With both reading it at
                    // once, starting a recording reconfigured the audio route and
                    // the movie lost its first ~8 seconds of sound.

                    if session.canAddOutput(movieOutput) { session.addOutput(movieOutput) }
                    // 2秒ごとに ファイルを 見られる 形に する（録画の とちゅうで アプリが 落ちても、
                    // そこまでの 映像は 再生できる。つぎの 起動で PendingSaves が ひろう）
                    movieOutput.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
                    // かめん：顔の 位置は カメラが くれる（Vision なし・ほぼ タダ）
                    privacy?.addOutputs(to: session)

                    // ✨キラキラ を出すときだけ、解析用の出力をもう一本足す。
                    // 録画とは別の出力なので、ここが詰まっても movieOutput の
                    // 書き込みには影響しない。
                    if wantsAnalysis {
                        analysisOutput.alwaysDiscardsLateVideoFrames = true
                        if session.canAddOutput(analysisOutput) {
                            session.addOutput(analysisOutput)
                            if let connection = analysisOutput.connection(with: .video) {
                                // プレビュー・録画と同じ向きと反転にそろえる。
                                // こうしておけば Vision が見る絵＝子どもが見ている絵で、
                                // かざり側で反転を掛け直さなくてよくなる。
                                if connection.isVideoMirroringSupported {
                                    connection.automaticallyAdjustsVideoMirroring = false
                                    connection.isVideoMirrored = true
                                }
                                if #available(iOS 17.0, *) {
                                    if connection.isVideoRotationAngleSupported(90) {
                                        connection.videoRotationAngle = 90
                                    }
                                } else if connection.isVideoOrientationSupported {
                                    connection.videoOrientation = .portrait
                                }
                            }
                            if let self { analysisOutput.setSampleBufferDelegate(self, queue: self.analysisQueue) }
                        } else {
                            print("⚡️  [MotionFX] live: the camera would not take an analysis output")
                        }
                    } else {
                        analysisOutput.setSampleBufferDelegate(nil, queue: nil)
                    }

                    if let connection = movieOutput.connection(with: .video) {
                        // Burn the mirroring into the file too, so the saved
                        // video matches the preview the child was watching.
                        if connection.isVideoMirroringSupported {
                            connection.automaticallyAdjustsVideoMirroring = false
                            connection.isVideoMirrored = true
                        }
                        // The app is portrait-locked for training.
                        if #available(iOS 17.0, *) {
                            if connection.isVideoRotationAngleSupported(90) {
                                connection.videoRotationAngle = 90
                            }
                        } else if connection.isVideoOrientationSupported {
                            connection.videoOrientation = .portrait
                        }
                    }

                    session.commitConfiguration()
                    cont.resume()
                } catch {
                    session.commitConfiguration()
                    cont.resume(throwing: error)
                }
            }
        }
    }

    @MainActor
    func stopPreview() {
        liveEffects?.stop()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        stateLock.lock()
        let generation = previewGeneration
        stateLock.unlock()
        sessionQueue.async { [weak self, session] in
            if session.isRunning { session.stopRunning() }
            // Only once capture has really stopped (deactivating with I/O still
            // running fails), and not if a new preview started in the meantime.
            guard let self else { return }
            self.stateLock.lock()
            let stale = self.previewGeneration != generation
            self.stateLock.unlock()
            if !stale {
                let audio = AVAudioSession.sharedInstance()
                try? audio.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                try? audio.setActive(true)
            }
        }
        previewView?.removeFromSuperview()
        previewView = nil
        previewLayer = nil
    }

    /// Keeps the preview layer matched to the web view as the device rotates
    /// or the keyboard resizes the scene.
    @MainActor
    func layoutPreview(to bounds: CGRect) {
        previewView?.frame = bounds
        previewLayer?.frame = bounds
        privacyOverlay?.layout()
    }

    // MARK: - Recording

    /// Recording state shared between the session queue and AVFoundation's
    /// delegate callbacks, which arrive on a queue we don't control. Every
    /// read and write of these goes through stateLock.
    private let stateLock = NSLock()
    private enum RecordingState {
        case idle
        case starting
        case recording
        /// AVFoundation finished the file without anyone asking it to stop — an
        /// interruption or runtime error mid-session. stopRecording() returns it
        /// instead of failing, so a cut-short practice is still saved.
        case finished(url: URL, usable: Bool, reason: String)
    }
    private var state: RecordingState = .idle
    private var startContinuation: CheckedContinuation<URL, Error>?
    private var previewGeneration = 0
    private var callbackStartHostSeconds: Double?
    private var firstFrameHostSeconds: Double?

    /// Host-clock time (seconds) when the movie actually started, used to line
    /// the separately recorded voice and the overlay up with the first frame.
    /// The first frame's own timestamp when iOS provides it (18.2+), otherwise
    /// the moment AVFoundation reported the start.
    var recordingStartHostSeconds: Double? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return firstFrameHostSeconds ?? callbackStartHostSeconds
    }

    private static func hostNow() -> Double {
        CMClockGetTime(CMClockGetHostTimeClock()).seconds
    }

    /// Resolves only once AVFoundation reports the file has really started, so
    /// a rejected start reaches JS as an error instead of a silent no-op.
    ///
    /// `url` は PendingSaves の フォルダ（Application Support）。tmp には 書かない：
    /// 録画の とちゅうで 落ちても、つぎの 起動まで のこる。
    func startRecording(to url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            sessionQueue.async { [self] in
                guard session.isRunning else {
                    cont.resume(throwing: CameraError.notRunning)
                    return
                }
                stateLock.lock()
                switch state {
                case .starting, .recording:
                    stateLock.unlock()
                    cont.resume(throwing: CameraError.alreadyRecording)
                    return
                case .idle, .finished:
                    break
                }
                if case let .finished(old, _, _) = state {
                    // stop で ひろわれなかった 録画。消さない：録画の 日記（PendingSaves）が もっていて、
                    // プラグインが 保存に まわす
                    print("⚡️  [KarateRecorder] earlier recording \(old.lastPathComponent) was never stopped; leaving it to its journal")
                }
                state = .starting
                startContinuation = cont
                callbackStartHostSeconds = nil
                firstFrameHostSeconds = nil
                stateLock.unlock()
                movieOutput.startRecording(to: url, recordingDelegate: self)
            }
        }
    }

    /// Resolves with the finished raw file once AVFoundation has flushed it.
    ///
    /// The state check and taking the continuation happen under one lock, so a
    /// recording that ends on its own at the same moment still resolves this.
    func stopRecording() async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            sessionQueue.async { [self] in
                stateLock.lock()
                switch state {
                case .starting, .recording:
                    if stopContinuation != nil {
                        stateLock.unlock()
                        cont.resume(throwing: CameraError.notRecording)
                        return
                    }
                    stopContinuation = cont
                    stateLock.unlock()
                    // A no-op if AVFoundation already stopped; didFinish will
                    // still arrive and resume the continuation just stored.
                    movieOutput.stopRecording()
                case let .finished(url, usable, reason):
                    state = .idle
                    stateLock.unlock()
                    // usable でなくても 消さない：とちゅうまでは 再生できる ことが おおい
                    // （movieFragmentInterval）。見られるかは プラグインが VideoCheck で しらべる
                    if FileManager.default.fileExists(atPath: url.path) {
                        print("⚡️  [KarateRecorder] recording had already ended (\(reason), usable=\(usable)); saving what was captured")
                        cont.resume(returning: url)
                    } else {
                        cont.resume(throwing: CameraError.notRecording)
                    }
                case .idle:
                    stateLock.unlock()
                    cont.resume(throwing: CameraError.notRecording)
                }
            }
        }
    }
}

extension CameraSession: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        recordingDidStart(fileURL, firstFrameHostSeconds: nil)
    }

    /// iOS 18.2+: carries the first written frame's timestamp, which lines the
    /// voice up more exactly than the moment this callback happens to run.
    @available(iOS 18.2, *)
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        startPTS: CMTime,
        from connections: [AVCaptureConnection]
    ) {
        var frameHost: Double?
        if startPTS.isValid {
            let host = CMClockGetHostTimeClock()
            let converted = session.synchronizationClock.map { CMSyncConvertTime(startPTS, from: $0, to: host) } ?? startPTS
            let seconds = converted.seconds
            // Guard against a clock we misread: the first frame can only be a
            // little before now.
            let now = Self.hostNow()
            if seconds.isFinite, seconds <= now + 0.05, now - seconds < 2 {
                frameHost = seconds
                print(String(format: "⚡️  [KarateRecorder] first frame %.0f ms before the start callback", (now - seconds) * 1000))
            }
        }
        recordingDidStart(fileURL, firstFrameHostSeconds: frameHost)
    }

    private func recordingDidStart(_ fileURL: URL, firstFrameHostSeconds frameHost: Double?) {
        let startedAt = Self.hostNow()
        stateLock.lock()
        let cont = startContinuation
        startContinuation = nil
        if case .starting = state { state = .recording }
        if callbackStartHostSeconds == nil { callbackStartHostSeconds = startedAt }
        if let frameHost { firstFrameHostSeconds = frameHost }
        stateLock.unlock()
        if cont != nil { print("⚡️  [KarateRecorder] recording started") }
        cont?.resume(returning: fileURL)
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        // A non-nil error can still come with a usable file (e.g. the disk
        // filled at the very end); AVFoundation flags that case explicitly.
        let usable = error == nil
            || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
        let reason = error?.localizedDescription ?? "no error"

        stateLock.lock()
        let start = startContinuation
        startContinuation = nil
        let stop = stopContinuation
        stopContinuation = nil
        let unexpected = start == nil && stop == nil
        state = unexpected ? .finished(url: outputFileURL, usable: usable, reason: reason) : .idle
        stateLock.unlock()

        if let start {
            // Finished before it ever started: AVFoundation rejected the request.
            print("⚡️  [KarateRecorder] recording failed to start: \(reason)")
            start.resume(throwing: error ?? CameraError.notRunning)
        }
        if let stop {
            if start != nil {
                stop.resume(throwing: error ?? CameraError.notRecording)
            } else if let error, !usable, !FileManager.default.fileExists(atPath: outputFileURL.path) {
                stop.resume(throwing: error)
            } else {
                // エラーつきでも ファイルが あれば かえす（見られるかは プラグインが しらべる）
                if let error, !usable { print("⚡️  [KarateRecorder] recording finished with an error (\(error.localizedDescription)); keeping the file") }
                stop.resume(returning: outputFileURL)
            }
        }
        if unexpected {
            print("⚡️  [KarateRecorder] recording ended unexpectedly: \(reason)")
            onRecordingInterrupted?("recordingEnded")
        }
    }
}

// MARK: - ✨キラキラ（稽古中）のためのコマ送り

extension CameraSession: AVCaptureVideoDataOutputSampleBufferDelegate {
    /// 解析用の出力からコマが届く。**ここは短く。** LiveMotionTracker は
    /// 1 コマだけ受け取ってすぐ返り、あとは自分のキューで処理する。
    /// 録画（movieOutput）はこの出力とは無関係に回り続ける。
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard output === analysisOutput else { return }
        liveEffects?.submit(sampleBuffer)
        privacyForFrames?.submit(sampleBuffer)
    }
}
