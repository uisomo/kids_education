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

    var isRecording: Bool { movieOutput.isRecording }

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

        try configureAudioSession()
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
        ) { note in
            let error = note.userInfo?[AVCaptureSessionErrorKey] as? NSError
            print("⚡️  [KarateRecorder] capture runtime error: \(error?.localizedDescription ?? "unknown") (\(error?.code ?? 0))")
        })
        observers.append(center.addObserver(
            forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil
        ) { note in
            let reason = (note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber)?.intValue ?? -1
            print("⚡️  [KarateRecorder] capture interrupted, reason \(reason)")
        })
        observers.append(center.addObserver(
            forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil
        ) { _ in
            print("⚡️  [KarateRecorder] capture interruption ended")
        })
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
                    session.sessionPreset = .high

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
        sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
        previewView?.removeFromSuperview()
        previewView = nil
        previewLayer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
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
    /// delegate callbacks, which arrive on a queue we don't control.
    private let stateLock = NSLock()
    private var startContinuation: CheckedContinuation<URL, Error>?
    /// A file AVFoundation finished without anyone asking it to stop — an
    /// interruption or runtime error mid-session. stopRecording() returns it
    /// instead of failing, so a cut-short practice is still saved.
    private var unexpectedFinish: (url: URL, usable: Bool, reason: String)?
    /// Host-clock time (seconds) when the movie actually started, used to line
    /// the separately recorded voice up with the first frame.
    private(set) var recordingStartHostSeconds: Double?

    /// Resolves only once AVFoundation reports the file has really started, so
    /// a rejected start reaches JS as an error instead of a silent no-op.
    func startRecording() async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            sessionQueue.async { [self] in
                guard session.isRunning else {
                    cont.resume(throwing: CameraError.notRunning)
                    return
                }
                guard !movieOutput.isRecording else {
                    cont.resume(throwing: CameraError.alreadyRecording)
                    return
                }
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("karate-raw-\(UUID().uuidString).mov")
                stateLock.lock()
                startContinuation = cont
                unexpectedFinish = nil
                stateLock.unlock()
                movieOutput.startRecording(to: url, recordingDelegate: self)
            }
        }
    }

    /// Resolves with the finished raw file once AVFoundation has flushed it.
    func stopRecording() async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            sessionQueue.async { [self] in
                if movieOutput.isRecording {
                    stateLock.lock()
                    stopContinuation = cont
                    stateLock.unlock()
                    movieOutput.stopRecording()
                    return
                }
                stateLock.lock()
                let finished = unexpectedFinish
                unexpectedFinish = nil
                stateLock.unlock()
                if let finished, finished.usable,
                   FileManager.default.fileExists(atPath: finished.url.path) {
                    print("⚡️  [KarateRecorder] recording had already ended (\(finished.reason)); saving what was captured")
                    cont.resume(returning: finished.url)
                } else {
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
        let startedAt = CMClockGetTime(CMClockGetHostTimeClock()).seconds
        stateLock.lock()
        let cont = startContinuation
        startContinuation = nil
        recordingStartHostSeconds = startedAt
        stateLock.unlock()
        print("⚡️  [KarateRecorder] recording started")
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
        if start == nil && stop == nil {
            unexpectedFinish = (outputFileURL, usable, reason)
        }
        stateLock.unlock()

        if let start {
            // Finished before it ever started: AVFoundation rejected the request.
            print("⚡️  [KarateRecorder] recording failed to start: \(reason)")
            start.resume(throwing: error ?? CameraError.notRunning)
        } else if let stop {
            if let error, !usable {
                stop.resume(throwing: error)
            } else {
                stop.resume(returning: outputFileURL)
            }
        } else {
            print("⚡️  [KarateRecorder] recording ended unexpectedly: \(reason)")
        }
    }
}
