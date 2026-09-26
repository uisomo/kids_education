#if os(iOS)
import Foundation
import AVFoundation

// 🎹 保存ずみの動画から **音だけ** を読んで、1コマずつの音にする。
//
// 絵（Vision）は一切通らないので速い: 30秒の練習で 1〜2秒。ピアノのアプリでは
// 手を追うのをやめて、こちらを使う。
@available(iOS 15.0, *)
public enum AudioTrackAnalyzer {
    /// 解析に使う音の細かさ。22050Hz あれば ピアノのいちばん高いド（4186Hz）まで
    /// 余裕で届く。細かくしても分かることは増えず、時間だけ増える。
    public static let sampleRate: Double = 22050

    /// 1秒に何コマ見るか。画面も動画も 30fps なので、そろえておくと
    /// 「音と絵がずれている」が起きない。
    public static let framesPerSecond: Double = 30

    public static func analyze(url: URL, maximumDuration: Double = 900,
                               progress: @escaping @Sendable (Double) -> Void = { _ in }) async throws -> [FXAudioFrame] {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration > 0, duration <= min(3600, max(1, maximumDuration)) else {
            throw FXError.unsupported("This clip is too long or has no duration.")
        }
        let tracks = try await asset.loadTracks(withMediaType: .audio)
        guard let track = tracks.first else {
            // 音の無い動画（マイクを切って録った）。かざりは出ないが、これは
            // 失敗ではない —— 呼び出し側が「音が無いね」と言うだけ。
            return []
        }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
        ])
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw FXError.unsupported("This recording's audio cannot be decoded.") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? FXError.invalidData("Audio decoding did not start.") }
        defer { if reader.status == .reading { reader.cancelReading() } }

        guard let engine = AudioToneEngine(sampleRate: sampleRate) else {
            throw FXError.invalidData("The tone engine could not be created.")
        }
        let hop = Int((sampleRate/framesPerSecond).rounded())
        var pending: [Float] = []
        pending.reserveCapacity(hop*4)
        var consumed = 0
        var frames: [FXAudioFrame] = []
        frames.reserveCapacity(Int(duration*framesPerSecond)+2)
        var reported = -1.0

        while reader.status == .reading {
            try Task.checkCancellation()
            guard let sample = output.copyNextSampleBuffer() else { break }
            autoreleasepool {
                if let block = CMSampleBufferGetDataBuffer(sample) {
                    var length = 0
                    var pointer: UnsafeMutablePointer<Int8>?
                    if CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil,
                                                   totalLengthOut: &length, dataPointerOut: &pointer) == noErr,
                       let pointer {
                        let count = length/MemoryLayout<Float>.size
                        pointer.withMemoryRebound(to: Float.self, capacity: count) { floats in
                            pending.append(contentsOf: UnsafeBufferPointer(start: floats, count: count))
                        }
                    }
                }
                while pending.count >= hop {
                    let chunk = Array(pending.prefix(hop))
                    pending.removeFirst(hop)
                    consumed += hop
                    let time = Double(consumed)/sampleRate
                    if let frame = engine.push(chunk, at: time) { frames.append(frame) }
                    let fraction = time/duration
                    if fraction-reported >= 0.05 { reported = fraction; progress(fxClamp(fraction)) }
                }
            }
        }
        if reader.status == .failed { throw reader.error ?? FXError.invalidData("Audio decoding failed.") }
        if reader.status == .cancelled { throw FXError.cancelled }
        progress(1)
        return frames
    }
}
#endif
