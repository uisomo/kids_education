#if os(iOS)
import Foundation
import AVFoundation
import CoreImage

public struct EffectsExportConfiguration: Sendable {
    public var maximumLongEdge: Int
    /// nil keeps AVFoundation's source-derived composition cadence; set 30 for a smaller export workload.
    public var framesPerSecond: Int?
    public var intensity: Double
    public var reduceMotion: Bool
    public init(maximumLongEdge: Int = 1920, framesPerSecond: Int? = nil,
                intensity: Double = 1, reduceMotion: Bool = false) {
        self.maximumLongEdge = min(1920,max(640,maximumLongEdge))
        self.framesPerSecond = framesPerSecond.map { min(60,max(15,$0)) }
        self.intensity = fxClamp(intensity); self.reduceMotion = reduceMotion
    }
    /// Re-sanitize public mutable settings at the API boundary.
    public var normalized: Self {
        .init(maximumLongEdge: maximumLongEdge,framesPerSecond: framesPerSecond,
              intensity: intensity,reduceMotion: reduceMotion)
    }
}
private final class ExportCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var session: AVAssetExportSession?
    private var cancelled = false
    func start(_ session: AVAssetExportSession, completion: @escaping @Sendable (Error?) -> Void) {
        lock.lock()
        guard !cancelled else { lock.unlock(); completion(CancellationError()); return }
        self.session = session
        // Serialize start against cancel: a cancellation just before start must not be lost.
        session.exportAsynchronously {
            switch session.status {
            case .completed: completion(nil)
            case .cancelled: completion(CancellationError())
            default: completion(session.error ?? FXError.invalidData("Video export did not complete."))
            }
        }
        lock.unlock()
    }
    func cancel() {
        lock.lock(); cancelled = true; let s = session; lock.unlock()
        s?.cancelExport()
    }
}
@available(iOS 17.0, *)
public enum VideoEffectsExporter {
    /// Creates a NEW movie. Never overwrites the original or an existing destination.
    /// Original audio is carried by AVAssetExportSession; it may be re-encoded by the preset.
    public static func export(sourceURL: URL, timeline: EffectTimeline, presetID: String,
                              destinationURL: URL, configuration: EffectsExportConfiguration = .init(),
                              progress: @escaping @Sendable (FXProgress) -> Void = { _ in }) async throws -> URL {
        let job = Task.detached(priority: .utility) {
            try await exportWorker(sourceURL: sourceURL,timeline: timeline,presetID: presetID,
                                   destinationURL: destinationURL,configuration: configuration.normalized,progress: progress)
        }
        return try await withTaskCancellationHandler(operation: { try await job.value },onCancel: { job.cancel() })
    }
    public static func makePreviewItem(sourceURL: URL, timeline: EffectTimeline, presetID: String,
                                      configuration: EffectsExportConfiguration = .init()) async throws -> AVPlayerItem {
        // The file read and geometry inspection are detached from the caller's UI actor.
        let job = Task.detached(priority: .utility) { () throws -> String in try VideoIdentity.make(sourceURL) }
        let identity = try await withTaskCancellationHandler(operation: { try await job.value },onCancel: { job.cancel() })
        try timeline.validate()
        guard identity == timeline.sourceID else { throw FXError.invalidData("The motion timeline belongs to a different video. Analyze this file first.") }
        let asset = AVURLAsset(url: sourceURL)
        let geometry = try await VideoGeometry.load(asset)
        let composition = try makeComposition(asset: asset,geometry: geometry,timeline: timeline,
                                              presetID: presetID,configuration: configuration.normalized)
        let item = AVPlayerItem(asset: asset); item.videoComposition = composition
        return item
    }
    private static func exportWorker(sourceURL: URL,timeline: EffectTimeline,presetID: String,
                                     destinationURL: URL,configuration: EffectsExportConfiguration,
                                     progress: @escaping @Sendable (FXProgress) -> Void) async throws -> URL {
        guard sourceURL.isFileURL, destinationURL.isFileURL else { throw FXError.unsupported("Use local file URLs.") }
        let src = sourceURL.standardizedFileURL.resolvingSymlinksInPath()
        let dst = destinationURL.standardizedFileURL.resolvingSymlinksInPath()
        guard src != dst, !FileManager.default.fileExists(atPath: dst.path) else {
            throw FXError.invalidData("Choose a new destination. Existing files are never overwritten.")
        }
        guard dst.pathExtension.lowercased() == "mp4" else { throw FXError.invalidData("The export destination must end in .mp4.") }
        try timeline.validate()
        progress(.init(.identifying,0))
        guard try VideoIdentity.make(sourceURL) == timeline.sourceID else {
            throw FXError.invalidData("The timeline does not match this exact source file. Re-analyze after editing or trimming.")
        }
        progress(.init(.identifying,1))
        let asset = AVURLAsset(url: sourceURL)
        let geometry = try await VideoGeometry.load(asset)
        guard abs(geometry.duration.seconds-timeline.duration) < 0.05 else { throw FXError.invalidData("The source duration changed.") }
        let composition = try makeComposition(asset: asset,geometry: geometry,timeline: timeline,
                                              presetID: presetID,configuration: configuration)
        guard let session = AVAssetExportSession(asset: asset,presetName: AVAssetExportPreset1920x1080) else {
            throw FXError.unsupported("The device could not create an export session.")
        }
        guard session.supportedFileTypes.contains(.mp4) else { throw FXError.unsupported("MP4 export is not supported for this source.") }
        session.outputURL = destinationURL; session.outputFileType = .mp4
        session.videoComposition = composition; session.shouldOptimizeForNetworkUse = true
        session.metadata = []
        let cancellation = ExportCancellation()
        let poll = Task.detached(priority: .utility) {
            // 見はり：60秒 すすまなければ やめる（とまった 書き出しで ずっと またせない）
            var last: Float = -1
            var lastChange = Date()
            while !Task.isCancelled {
                let p = session.progress
                progress(.init(.exporting,Double(p)))
                if p != last { last = p; lastChange = Date() }
                else if Date().timeIntervalSince(lastChange) > 60 {
                    print("⚡️  [MotionFX] export stalled at \(Int(p * 100))%; cancelling")
                    cancellation.cancel()
                    return
                }
                do { try await Task.sleep(nanoseconds: 200_000_000) } catch { return }
            }
        }
        defer { poll.cancel() }
        do {
            try Task.checkCancellation()
            try await withTaskCancellationHandler(operation: {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void,Error>) in
                    cancellation.start(session) { error in
                        if let error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: ()) }
                    }
                }
            },onCancel: { cancellation.cancel() })
            try Task.checkCancellation()
            guard FileManager.default.fileExists(atPath: destinationURL.path) else { throw FXError.invalidData("Export completed without an output file.") }
            progress(.init(.exporting,1))
            return destinationURL
        } catch {
            cancellation.cancel()
            // The destination was checked absent before export. The source is never touched.
            try? FileManager.default.removeItem(at: destinationURL)
            throw error
        }
    }
    private static func makeComposition(asset: AVAsset,geometry: VideoGeometry,timeline: EffectTimeline,
                                        presetID: String,configuration: EffectsExportConfiguration) throws -> AVMutableVideoComposition {
        let catalog = try EffectCatalog.bundled()
        guard let preset = catalog.preset(presetID), preset.mode == timeline.mode else {
            throw FXError.invalidData("Choose an effect preset for this recording's practice mode.")
        }
        let scale = min(1,CGFloat(configuration.maximumLongEdge)/max(geometry.sourceSize.width,geometry.sourceSize.height))
        let width = max(2,Int((geometry.sourceSize.width*scale/2).rounded())*2)
        let height = max(2,Int((geometry.sourceSize.height*scale/2).rounded())*2)
        let outputRect = CGRect(x: 0,y: 0,width: width,height: height)
        let rasterizer = OverlayRasterizer(catalog: catalog)
        let ciContext = CIContext(options: [.cacheIntermediates: false])
        // This AVFoundation constructor derives the source's preferred orientation from the asset.
        // Do not apply preferredTransform again in the filtering callback (that would rotate twice).
        let composition = AVMutableVideoComposition(asset: asset,applyingCIFiltersWithHandler: { request in
            autoreleasepool {
                do {
                    let source = request.sourceImage
                    let extent = source.extent
                    guard extent.width > 0, extent.height > 0 else { throw FXError.invalidData("Empty export frame.") }
                    let actualAspect = extent.width/extent.height
                    let expectedAspect = geometry.sourceSize.width/geometry.sourceSize.height
                    guard abs(actualAspect/expectedAspect-1) < 0.03 else {
                        throw FXError.unsupported("This source's composition orientation needs host-app normalization. No misaligned export was created.")
                    }
                    let base = source.transformed(by: .init(translationX: -extent.minX,y: -extent.minY))
                        .transformed(by: .init(scaleX: outputRect.width/extent.width,y: outputRect.height/extent.height))
                    let time = request.compositionTime.seconds
                    let scene = timeline.scene(at: time,preset: preset,intensity: configuration.intensity,
                                               reduceMotion: configuration.reduceMotion)
                    // 空気・にじみ（ブルーム）・光を **1か所で** 組み立てる
                    // （`OverlayRasterizer.composite`）。ハーネスも同じ道を通る。
                    let image = try rasterizer.composite(scene: scene,over: base,outputRect: outputRect)
                    request.finish(with: image.cropped(to: outputRect),context: ciContext)
                } catch { request.finish(with: error) }
            }
        })
        composition.renderSize = outputRect.size
        if let fps = configuration.framesPerSecond { composition.frameDuration = CMTime(value: 1,timescale: CMTimeScale(fps)) }
        // Intentional SDR export. Dolby Vision/HDR metadata is not promised; retain the original for that.
        composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
        composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
        composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
        return composition
    }
}
#endif
