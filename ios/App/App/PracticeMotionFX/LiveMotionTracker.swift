#if os(iOS)
import Foundation
import AVFoundation
import QuartzCore
import ImageIO

public struct LiveTrackingUpdate: Sendable {
    public let frame: EffectFrame
    public let acceptedHostTime: Double
    public let processingMilliseconds: Double
    public let effectiveTrackingFPS: Double
    public let skippedFrames: Int
    public let errorDescription: String?
}
/// No camera session is created here. Feed a *tap* of the host app's existing video frames.
/// At most ONE frame is retained for analysis. Recording must never depend on submit() returning true.
public final class LiveMotionTracker: @unchecked Sendable {
    private let queue = DispatchQueue(label: "PracticeMotionFX.vision", qos: .userInitiated)
    private let lock = NSLock()
    private var busy = false, stopped = false
    private var lastAccepted = -Double.infinity
    private var token = 0, workerToken = -1, skipped = 0
    private var lastOrientation: CGImagePropertyOrientation?
    private var budget: TrackingBudget
    private let configuration: TrackingConfiguration
    private let detector: VisionPoseDetector
    private let engine: MotionEngine
    private let preprocessor = FramePreprocessor()
    private let onUpdate: @Sendable (LiveTrackingUpdate) -> Void
    public init(configuration: TrackingConfiguration,
                onUpdate: @escaping @Sendable (LiveTrackingUpdate) -> Void) {
        let configuration = configuration.normalized
        self.configuration = configuration; self.onUpdate = onUpdate
        detector = VisionPoseDetector(configuration: configuration)
        engine = MotionEngine(configuration: configuration)
        budget = TrackingBudget(targetFPS: configuration.framesPerSecond)
    }
    public func reset() {
        lock.lock(); token += 1; lastAccepted = -.infinity; lastOrientation = nil; lock.unlock()
    }
    public func setEnabled(_ enabled: Bool) {
        lock.lock(); stopped = !enabled; token += 1; lastAccepted = -.infinity; lock.unlock()
    }
    @discardableResult
    public func submit(_ sampleBuffer: CMSampleBuffer, orientation: CGImagePropertyOrientation) -> Bool {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return false }
        return submit(pixelBuffer, time: CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds, orientation: orientation)
    }
    @discardableResult
    public func submit(_ pixelBuffer: CVPixelBuffer, time: Double, orientation: CGImagePropertyOrientation) -> Bool {
        guard time.isFinite, time >= 0 else { return false }
        let pressure: TrackingBudget.Pressure
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: pressure = .nominal
        case .fair: pressure = .fair
        case .serious: pressure = .serious
        case .critical: pressure = .critical
        @unknown default: pressure = .serious
        }
        lock.lock()
        if let lastOrientation, lastOrientation != orientation { token += 1; lastAccepted = -.infinity }
        self.lastOrientation = orientation
        if time < lastAccepted { token += 1; lastAccepted = -.infinity }
        let fps = budget.effectiveFPS(pressure: pressure, lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
        guard !stopped, !busy, fps > 0, time-lastAccepted >= 1/fps-0.001 else {
            skipped += 1; lock.unlock(); return false
        }
        busy = true; lastAccepted = time
        let workToken = token, count = skipped; let accepted = CACurrentMediaTime()
        lock.unlock()
        queue.async { [self] in
            let result: LiveTrackingUpdate = autoreleasepool {
                do {
                    if workerToken != workToken { detector.reset(); engine.reset(); workerToken = workToken }
                    let edge = (pressure == .serious || pressure == .fair) ? min(configuration.longestAnalysisEdge,512) : configuration.longestAnalysisEdge
                    let (small,size) = try preprocessor.prepare(pixelBuffer,orientation: orientation,longestEdge: edge)
                    let pose = try detector.process(small,time: time,sourceSize: size)
                    let frame = engine.process(pose)
                    return LiveTrackingUpdate(frame: frame,acceptedHostTime: accepted,
                        processingMilliseconds: (CACurrentMediaTime()-accepted)*1000,effectiveTrackingFPS: fps,
                        skippedFrames: count,errorDescription: nil)
                } catch {
                    engine.reset(); detector.reset()
                    return LiveTrackingUpdate(frame: .init(time: time,sourceSize: FXSize(1,1)),acceptedHostTime: accepted,
                        processingMilliseconds: (CACurrentMediaTime()-accepted)*1000,effectiveTrackingFPS: fps,
                        skippedFrames: count,errorDescription: error.localizedDescription)
                }
            }
            lock.lock()
            budget.observe(milliseconds: result.processingMilliseconds)
            let deliver = !stopped && token == workToken
            lock.unlock()
            if deliver { onUpdate(result) } // worker queue; UI consumers hop to MainActor
            // Keep the gate closed through delivery: even a slow callback must not queue another frame.
            lock.lock(); busy = false; lock.unlock()
        }
        return true
    }
}
#endif
