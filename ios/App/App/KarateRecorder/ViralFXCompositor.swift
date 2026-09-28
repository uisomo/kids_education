@preconcurrency import AVFoundation
import AlanKit
import CoreImage
import Photos

/// バズる録画の 演出（SERIES_GUIDE 5.14）を 空手・ピアノの 書き出しに かける。
///
/// 演出の 中身は ぜんぶ AlanKit の `ViralFXRenderer`（シリーズ共通）。ここは 空手・ピアノだけの ところ：
///   - 種目ごとに 区切る（`segments`）。種目が かわると 配色・シネマの 色・人の 見た目が かわり、フラッシュ
///   - カメラの コマに 演出を かけてから、いままでの 文字（Hook・種目名・特訓一覧）を Core Animation で かさねる
///
/// `AVMutableVideoComposition(asset:applyingCIFiltersWithHandler:)` だと Core Animation の 文字が
/// 消えてしまう（animationTool が つかわれない）ので、じぶんの コンポジター（`ViralFXVideoCompositor`）を つかう。
/// こちらは animationTool と いっしょに うごく。
enum KarateViralFX {
    /// 設定が ぜんぶ オフか（オフなら いままでの 書き出しと まったく おなじに する）
    static func isOff(_ s: ViralFXSettings) -> Bool { s == ViralFXSettings() }

    /// 種目ごとの 区切り。events の drillIndex が かわった ところが 種目の はじまり（秒）。
    /// 休憩は 区切りに しない（まえの 種目の 見た目の まま）
    static func segments(events: [OverlayCompositor.Event], menu: [OverlayCompositor.MenuItem]) -> [ViralFXSegment] {
        var out: [ViralFXSegment] = []
        var last: Int?
        var lastName: String?
        for event in events {
            if let index = (event.patch["drillIndex"] as? NSNumber)?.intValue {
                guard index != last else { continue }
                last = index
                guard index >= 0, index < menu.count, !menu[index].isRest else { continue }
                let name = menu[index].name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { continue }
                out.append(ViralFXSegment(start: event.t / 1000, text: lines(name)))
            } else if menu.isEmpty, let name = event.patch["drill"] as? String, !name.isEmpty, name != lastName {
                // メニューが こなかった とき（ふるい 形）：種目の 名前が かわった ところ
                lastName = name
                out.append(ViralFXSegment(start: event.t / 1000, text: lines(name)))
            }
        }
        return out
    }

    /// さいごまで やりきった しゅんかん（drillIndex が メニューの おわりに なった とき）。フラッシュする
    static func finishMoments(events: [OverlayCompositor.Event], menu: [OverlayCompositor.MenuItem]) -> [Double] {
        guard !menu.isEmpty else { return [] }
        return events.compactMap { event in
            guard let index = (event.patch["drillIndex"] as? NSNumber)?.intValue, index >= menu.count else { return nil }
            return event.t / 1000
        }.prefix(1).map { $0 }
    }

    /// 種目の 名前を 人の うしろの 文字に（2行まで。みじかい 名前は 1行）
    static func lines(_ name: String) -> [String] {
        let text = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let chars = Array(text)
        guard chars.count > 6 else { return [text] }
        // 1. 空白で わかれていれば、2つの 長さが いちばん 近くなる ところで わける
        let words = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if words.count >= 2 {
            var best = 1
            var bestDiff = Int.max
            for k in 1..<words.count {
                let a = words[..<k].joined(separator: " ").count
                let b = words[k...].joined(separator: " ").count
                if abs(a - b) < bestDiff { bestDiff = abs(a - b); best = k }
            }
            return [words[..<best].joined(separator: " "), words[best...].joined(separator: " ")]
        }
        // 2. 「・」「、」などの あとで わける（まんなかに ちかい もの）
        let mid = chars.count / 2
        let marks: Set<Character> = ["・", "、", "／", "/", "-", "ー"]
        let cuts = chars.indices.dropLast().filter { marks.contains(chars[$0]) && $0 > 0 }
        if let cut = cuts.min(by: { abs($0 + 1 - mid) < abs($1 + 1 - mid) }), abs(cut + 1 - mid) <= 2 {
            return [String(chars[...cut]), String(chars[(cut + 1)...])]
        }
        // 3. まんなかで わける
        let half = (chars.count + 1) / 2
        return [String(chars[..<half]), String(chars[half...])]
    }

    /// カメラの コマが どちら向きに 入っているか（track の preferredTransform から）。
    /// きもちの MangaCompositor と おなじ 対応
    static func orientation(for t: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (Int(t.a.rounded()), Int(t.b.rounded()), Int(t.c.rounded()), Int(t.d.rounded())) {
        case (0, 1, -1, 0): return .right
        case (0, -1, 1, 0): return .left
        case (-1, 0, 0, -1): return .down
        case (-1, 0, 0, 1): return .upMirrored
        case (1, 0, 0, -1): return .downMirrored
        case (0, 1, 1, 0): return .leftMirrored
        case (0, -1, -1, 0): return .rightMirrored
        default: return .up
        }
    }

    /// 写真の ストップの コマを 写真へ（追加だけの 権限）。しっぱいしても 動画には ひびかない
    static func saveStills(_ stills: [CIImage]) {
        guard !stills.isEmpty else { return }
        let context = CIContext()
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let photos: [Data] = stills.compactMap { still in
            context.jpegRepresentation(of: still, colorSpace: space, options: [:])
        }
        guard !photos.isEmpty else { return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                print("⚡️  [KarateRecorder] viralfx: 写真の 権限が ないので \(photos.count) まいを 保存しなかった")
                return
            }
            PHPhotoLibrary.shared().performChanges {
                for data in photos {
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
                }
            } completionHandler: { ok, error in
                print("⚡️  [KarateRecorder] viralfx: 写真 \(photos.count) まい \(ok ? "保存した" : "保存できなかった: \(error?.localizedDescription ?? "?")")")
            }
        }
    }
}

/// 書き出しの 1本ぶんの しじ。コンポジターは AVFoundation が つくるので、Renderer は ここで わたす
final class ViralFXInstruction: NSObject, AVVideoCompositionInstructionProtocol, @unchecked Sendable {
    let timeRange: CMTimeRange
    /// この あとに Core Animation の 文字（animationTool）を かさねる
    let enablePostProcessing = true
    let containsTweening = true
    let requiredSourceTrackIDs: [NSValue]?
    let passthroughTrackID = kCMPersistentTrackID_Invalid

    let trackID: CMPersistentTrackID
    let renderer: ViralFXRenderer
    let orientation: CGImagePropertyOrientation
    let size: CGSize

    /// 写真の ストップに つかう コマは コピーしておく（デコーダーの バッファを 書き出しの おわりまで にぎらない）
    private var copied: Set<Int> = []
    private let lock = NSLock()

    init(timeRange: CMTimeRange, trackID: CMPersistentTrackID, renderer: ViralFXRenderer,
         orientation: CGImagePropertyOrientation, size: CGSize) {
        self.timeRange = timeRange
        self.trackID = trackID
        self.requiredSourceTrackIDs = [NSNumber(value: trackID)]
        self.renderer = renderer
        self.orientation = orientation
        self.size = size
    }

    /// `t` が まだ コピーしていない しゅんかんの さいしょの コマか
    func takeFreezeFrame(at t: Double) -> Bool {
        guard renderer.settings.photos else { return false }
        lock.lock()
        defer { lock.unlock() }
        for (i, m) in renderer.moments.enumerated() where t >= m && t < m + 1 && !copied.contains(i) {
            copied.insert(i)
            return true
        }
        return false
    }
}

/// カメラの コマに バズる演出を かける コンポジター。文字は この あと animationTool が かさねる
final class ViralFXVideoCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let space = CGColorSpace(name: CGColorSpace.sRGB)!

    var sourcePixelBufferAttributes: [String: any Sendable]? {
        [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    }

    var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] {
        [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    }

    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        guard let ins = request.videoCompositionInstruction as? ViralFXInstruction,
              let source = request.sourceFrame(byTrackID: ins.trackID),
              let output = request.renderContext.newPixelBuffer() else {
            request.finish(with: OverlayCompositor.CompositorError.exportFailed("viralfx: no frame"))
            return
        }
        autoreleasepool {
            var frame = CIImage(cvPixelBuffer: source)
            // iOS に よって 横向きの まま 来る ことも、もう たてに なって 来る ことも ある
            if abs(frame.extent.width - ins.size.width) > 1 || abs(frame.extent.height - ins.size.height) > 1 {
                frame = frame.oriented(ins.orientation)
            }
            frame = frame.transformed(by: CGAffineTransform(translationX: -frame.extent.minX, y: -frame.extent.minY))
            let t = request.compositionTime.seconds
            if ins.takeFreezeFrame(at: t), let copy = context.createCGImage(frame, from: frame.extent) {
                frame = CIImage(cgImage: copy)
            }
            let image = ins.renderer.render(frame, t: t)
            context.render(image, to: output, bounds: CGRect(origin: .zero, size: ins.size), colorSpace: space)
        }
        request.finish(withComposedVideoFrame: output)
    }
}
