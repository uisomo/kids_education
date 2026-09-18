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
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var previewView: UIView?
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
            return
        }
        previewView?.removeFromSuperview()

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
            guard let self, self.isRecording else { return }
            self.onRecordingInterrupted?(Self.interruptionName(code))
        })
        observers.append(center.addObserver(
            forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil
        ) { _ in
            print("⚡️  [KarateRecorder] capture interruption ended")
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

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            sessionQueue.async { [session, movieOutput] in
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
                try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
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
    func startRecording() async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            sessionQueue.async { [self] in
                guard session.isRunning else {
                    cont.resume(throwing: CameraError.notRunning)
                    return
                }
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("karate-raw-\(UUID().uuidString).mov")
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
                    // Never collected by a stop; don't leave it behind.
                    try? FileManager.default.removeItem(at: old)
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
                    if usable, FileManager.default.fileExists(atPath: url.path) {
                        print("⚡️  [KarateRecorder] recording had already ended (\(reason)); saving what was captured")
                        cont.resume(returning: url)
                    } else {
                        try? FileManager.default.removeItem(at: url)
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
            } else if let error, !usable {
                stop.resume(throwing: error)
            } else {
                stop.resume(returning: outputFileURL)
            }
        }
        if unexpected {
            print("⚡️  [KarateRecorder] recording ended unexpectedly: \(reason)")
            onRecordingInterrupted?("recordingEnded")
        }
    }
}
