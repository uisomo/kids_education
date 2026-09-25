#if os(iOS)
import Foundation
import AVFoundation
import CoreVideo
import CryptoKit

public struct FXProgress: Sendable {
    public enum Phase: String, Sendable { case identifying, analyzing, exporting }
    public let phase: Phase
    public let fraction: Double
    public init(_ phase: Phase, _ fraction: Double) { self.phase = phase; self.fraction = fxClamp(fraction) }
}
@available(iOS 17.0, *)
struct VideoGeometry {
    let track: AVAssetTrack
    let duration: CMTime
    let sourceSize: CGSize
    let uprightTransform: CGAffineTransform
    static func load(_ asset: AVAsset) async throws -> VideoGeometry {
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard tracks.count == 1, let track = tracks.first else {
            throw FXError.unsupported("Use a local recording with exactly one video track. Multi-angle/spatial compositions need host-app integration.")
        }
        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let bounds = CGRect(origin: .zero,size: size).applying(transform).standardized
        let duration = try await asset.load(.duration)
        guard duration.seconds.isFinite, duration.seconds > 0, bounds.width > 0, bounds.height > 0 else {
            throw FXError.invalidData("The video has an invalid size or duration.")
        }
        let upright = transform.concatenating(.init(translationX: -bounds.minX,y: -bounds.minY))
        return VideoGeometry(track: track,duration: duration,sourceSize: bounds.size,uprightTransform: upright)
    }
    func composition(longestEdge: Int, framesPerSecond: Int) -> AVMutableVideoComposition {
        let scale = min(1,CGFloat(longestEdge)/max(sourceSize.width,sourceSize.height))
        let w = max(2,Int((sourceSize.width*scale/2).rounded())*2)
        let h = max(2,Int((sourceSize.height*scale/2).rounded())*2)
        let video = AVMutableVideoComposition()
        video.renderSize = CGSize(width: w,height: h)
        video.frameDuration = CMTime(value: 1,timescale: CMTimeScale(framesPerSecond))
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        layer.setTransform(uprightTransform.concatenating(.init(scaleX: CGFloat(w)/sourceSize.width,y: CGFloat(h)/sourceSize.height)),at: .zero)
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero,duration: duration)
        instruction.layerInstructions = [layer]
        video.instructions = [instruction]
        // Analysis is SDR. The source recording is neither modified nor replaced.
        video.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
        video.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
        video.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
        return video
    }
}
enum VideoIdentity {
    static func make(_ url: URL) throws -> String {
        guard url.isFileURL else { throw FXError.unsupported("Only local video URLs are supported. No footage is uploaded.") }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var hash = SHA256()
        while true {
            try Task.checkCancellation()
            guard let data = try handle.read(upToCount: 1_048_576), !data.isEmpty else { break }
            hash.update(data: data)
        }
        return "sha256:"+hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
@available(iOS 17.0, *)
public enum VideoMotionAnalyzer {
    /// Run after recording. Off-main-thread, cancellable, bounded to 15 minutes by default.
    public static func analyze(url: URL, configuration: TrackingConfiguration,
                               maximumDuration: Double = 900,
                               progress: @escaping @Sendable (FXProgress) -> Void = { _ in }) async throws -> EffectTimeline {
        let job = Task.detached(priority: .utility) {
            try await analyzeWorker(url: url,configuration: configuration.normalized,maximumDuration: maximumDuration,progress: progress)
        }
        return try await withTaskCancellationHandler(operation: { try await job.value },onCancel: { job.cancel() })
    }
    private static func analyzeWorker(url: URL, configuration: TrackingConfiguration,maximumDuration: Double,
                                      progress: @escaping @Sendable (FXProgress) -> Void) async throws -> EffectTimeline {
        guard url.isFileURL else { throw FXError.unsupported("Import the video to an app-local file before analysis.") }
        let asset = AVURLAsset(url: url)
        let geometry = try await VideoGeometry.load(asset)
        guard geometry.duration.seconds <= min(3600,max(1,maximumDuration)) else {
            throw FXError.unsupported("This clip exceeds the configured analysis duration limit. Analyze a shorter practice segment.")
        }
        progress(.init(.identifying,0))
        let identity = try VideoIdentity.make(url)
        progress(.init(.identifying,1))
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderVideoCompositionOutput(videoTracks: [geometry.track],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        output.videoComposition = geometry.composition(longestEdge: configuration.longestAnalysisEdge,
            framesPerSecond: max(1,Int(configuration.framesPerSecond.rounded())))
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw FXError.unsupported("The video cannot be decoded for pose analysis.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? FXError.invalidData("Video decoding did not start.") }
        defer { if reader.status == .reading { reader.cancelReading() } }
        let detector = VisionPoseDetector(configuration: configuration)
        let engine = MotionEngine(configuration: configuration)
        let sourceSize = FXSize(Double(geometry.sourceSize.width),Double(geometry.sourceSize.height))
        var frames: [EffectFrame] = []
        frames.reserveCapacity(min(108_001,Int(geometry.duration.seconds*configuration.framesPerSecond)+2))
        var lastTime = -Double.infinity, reported = -1.0
        while reader.status == .reading {
            try Task.checkCancellation()
            let didRead: Bool = try autoreleasepool {
                guard let sample = output.copyNextSampleBuffer() else { return false }
                guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return true }
                let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
                guard time.isFinite, time >= 0, time > lastTime, time <= geometry.duration.seconds else { return true }
                lastTime = time
                let pose = try detector.process(buffer,time: time,sourceSize: sourceSize)
                frames.append(engine.process(pose))
                if time/geometry.duration.seconds-reported >= 0.02 {
                    reported = time/geometry.duration.seconds; progress(.init(.analyzing,reported))
                }
                return true
            }
            if !didRead { break }
        }
        try Task.checkCancellation()
        if reader.status == .failed { throw reader.error ?? FXError.invalidData("Video decoding failed.") }
        if reader.status == .cancelled { throw FXError.cancelled }
        guard !frames.isEmpty else { throw FXError.invalidData("No readable video frames were found.") }
        progress(.init(.analyzing,1))
        return try EffectTimeline(sourceID: identity,mode: configuration.mode,duration: geometry.duration.seconds,frames: frames)
    }
}
#endif
