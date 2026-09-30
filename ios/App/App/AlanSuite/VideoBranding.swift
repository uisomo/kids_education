@preconcurrency import AVFoundation
import CoreImage
import QuartzCore
import UIKit

/// Source: アランの基盤/packages/media/ios. The artwork is loaded once per export.
/// The video covers the frame's whole inside with no gap: its edges tuck under
/// the border and the ribbon covers its bottom. The app name sits on the ribbon. Both are measured from the frame
/// PNG's transparency, so every app's frame fits without per-app numbers.
enum VideoBranding {
    private static func image(_ name: String) -> UIImage? {
        if let root = Bundle.main.url(forResource: "public", withExtension: nil),
           let image = UIImage(contentsOfFile: root.appendingPathComponent("alan/video/\(name).png").path) { return image }
        return UIImage(named: name == "frame" ? "VideoFrame" : "VideoWordmark")
    }

    /// The newer frames (brand/video/build_frame.py) carry the app's title in
    /// their base; `alan/video/frame.json` `{"title": true}` says so, and then the
    /// wordmark is not drawn again (it is still used for the opening's logo).
    /// Native apps (ことばクラッシュ) keep the same JSON as the `VideoFrameInfo` data asset.
    private static var frameHasTitle: Bool {
        let data = Bundle.main.url(forResource: "public", withExtension: nil)
            .flatMap { try? Data(contentsOf: $0.appendingPathComponent("alan/video/frame.json")) }
            ?? NSDataAsset(name: "VideoFrameInfo")?.data
        guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["title"] as? Bool ?? false
    }

    /// Top-left origin, in pixels of the output video.
    struct Layout {
        /// The frame's inside, from the border to the top of the ribbon.
        var video: CGRect
        var logo: CGRect
        /// White where the frame is see-through inside the border (flood-filled
        /// from the middle), so the video never shows outside the frame.
        var mask: CGImage?
        /// What shows outside that inside (below the ribbon, the round corners):
        /// the frame's own color, so no black is ever seen.
        var backdrop: CGImage?
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var layouts: [String: Layout] = [:]

    /// Reads the frame's alpha at `size`: the inner edge of the border, the top
    /// of the ribbon, and the icon standing on the ribbon (heart, coin …).
    static func layout(size: CGSize) -> Layout {
        let key = "\(Int(size.width))x\(Int(size.height))"
        lock.lock(); defer { lock.unlock() }
        if let hit = layouts[key] { return hit }
        let result = measure(size: size)
        layouts[key] = result
        return result
    }

    private static func measure(size: CGSize) -> Layout {
        let w = max(Int(size.width), 1), h = max(Int(size.height), 1)
        let fallback = Layout(
            video: CGRect(x: size.width * 0.04, y: size.height * 0.03, width: size.width * 0.92, height: size.height * 0.85),
            logo: CGRect(x: size.width * 0.22, y: size.height * 0.9, width: size.width * 0.56, height: size.height * 0.07),
            mask: nil, backdrop: nil)
        guard let frame = image("frame")?.cgImage,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = ctx.data else { return fallback }
        ctx.draw(frame, in: CGRect(x: 0, y: 0, width: w, height: h))
        let px = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
        // Row 0 of a bitmap context is the top of the image.
        func solid(_ x: Int, _ y: Int) -> Bool { px[(y * w + x) * 4 + 3] > 128 }

        let row = h * 45 / 100
        var left = 0, right = w
        for x in 0..<(w / 2) where solid(x, row) { left = x + 1 }
        for x in stride(from: w - 1, through: w / 2, by: -1) where solid(x, row) { right = x }
        var top = 0
        for y in 0..<(h / 2) where solid(w / 2, y) { top = y + 1 }
        // The ribbon: highest solid pixel in the lower half, across the middle 40%.
        var ribbon = h
        for x in stride(from: w * 3 / 10, to: w * 7 / 10, by: 2) {
            for y in (h / 2)..<h where solid(x, y) { ribbon = min(ribbon, y); break }
        }
        var bottom = ribbon
        for y in ribbon..<h where solid(w / 2, y) { bottom = y }
        guard left < right, top < ribbon, ribbon < h, bottom > ribbon else { return fallback }
        // Icons stick up above the ribbon at its ends; keep the name clear of them.
        var iconRight = left, iconLeft = right
        let rows = max(0, ribbon - h * 12 / 100)..<max(0, ribbon - h * 35 / 1000)
        for y in rows {
            for x in (left + 2)..<(w / 2) where solid(x, y) { iconRight = max(iconRight, x) }
            for x in (w / 2)..<max(w / 2, right - 2) where solid(x, y) { iconLeft = min(iconLeft, x) }
        }

        let video = CGRect(x: CGFloat(left), y: CGFloat(top), width: CGFloat(right - left), height: CGFloat(ribbon - top))
        let pad = size.width * 0.03
        let half = min(size.width / 2 - CGFloat(iconRight), CGFloat(iconLeft) - size.width / 2) - pad
        let maxWidth = min(2 * half, size.width < size.height ? size.width * 0.56 : size.width * 0.4)
        let logo = CGRect(x: size.width / 2 - maxWidth / 2, y: CGFloat(ribbon),
                          width: maxWidth, height: CGFloat(bottom - ribbon))
        // The frame's color: the left border at mid height (the base may carry the
        // title's many colors). Near-opaque, since scaling rarely leaves exactly 255.
        var sum = [0, 0, 0], n = 0
        for y in stride(from: h * 4 / 10, to: h / 2, by: 2) {
            for x in 0..<left where px[(y * w + x) * 4 + 3] >= 240 {
                let i = (y * w + x) * 4
                sum[0] += Int(px[i]); sum[1] += Int(px[i + 1]); sum[2] += Int(px[i + 2]); n += 1
            }
        }
        let color = n > 0 ? UIColor(red: CGFloat(sum[0] / n) / 255, green: CGFloat(sum[1] / n) / 255,
                                    blue: CGFloat(sum[2] / n) / 255, alpha: 1) : UIColor(white: 0.2, alpha: 1)
        return Layout(video: video, logo: logo, mask: insideMask(w: w, h: h, solid: solid),
                      backdrop: backdrop(size: size, color: color))
    }

    /// The frame's color, a little darker toward the bottom (like the ribbon's shade).
    private static func backdrop(size: CGSize, color: UIColor) -> CGImage? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        let dark = UIColor(red: r * 0.7, green: g * 0.7, blue: b * 0.7, alpha: 1)
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = true
        return UIGraphicsImageRenderer(size: size, format: f).image { ctx in
            let colors = [color.cgColor, dark.cgColor] as CFArray
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
            ctx.cgContext.drawLinearGradient(gradient, start: CGPoint(x: 0, y: size.height * 0.8),
                                             end: CGPoint(x: 0, y: size.height), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }.cgImage
    }

    private static func insideMask(w: Int, h: Int, solid: (Int, Int) -> Bool) -> CGImage? {
        var inside = [UInt8](repeating: 0, count: w * h)
        var stack = [(w / 2) + (h * 45 / 100) * w]
        while let i = stack.popLast() {
            let x = i % w, y = i / w
            guard inside[i] == 0, !solid(x, y) else { continue }
            inside[i] = 1
            if x > 0 { stack.append(i - 1) }
            if x < w - 1 { stack.append(i + 1) }
            if y > 0 { stack.append(i - w) }
            if y < h - 1 { stack.append(i + w) }
        }
        // Premultiplied white: its alpha masks a layer and its luminance masks Core Image.
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0..<(w * h) where inside[i] == 1 {
            rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = 255
        }
        return rgba.withUnsafeMutableBytes { buf in
            CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(),
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)?.makeImage()
        }
    }

    static func artwork(size: CGSize) -> CGImage? {
        guard let frame = image("frame") else { return nil }
        let layout = layout(size: size)
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = false
        return UIGraphicsImageRenderer(size: size, format: f).image { r in
            frame.draw(in: CGRect(origin: .zero, size: size))
            guard !frameHasTitle, let mark = image("wordmark") else { return }
            // The name printed on the ribbon: white sticker edge + soft shadow, no box.
            let area = layout.logo
            let scale = min(area.width / mark.size.width, area.height * 0.66 / mark.size.height)
            let s = CGSize(width: mark.size.width * scale, height: mark.size.height * scale)
            let rect = CGRect(x: area.midX - s.width / 2, y: area.midY - s.height / 2, width: s.width, height: s.height)
            let edge = max(2, s.height * 0.08)
            let white = mark.withTintColor(.white, renderingMode: .alwaysOriginal)
            let cg = r.cgContext
            cg.saveGState()
            cg.setShadow(offset: CGSize(width: 0, height: edge), blur: edge * 1.5,
                         color: UIColor.black.withAlphaComponent(0.35).cgColor)
            cg.beginTransparencyLayer(auxiliaryInfo: nil)
            for i in 0..<16 {
                let a = CGFloat(i) / 16 * 2 * .pi
                white.draw(in: rect.offsetBy(dx: cos(a) * edge, dy: sin(a) * edge))
            }
            cg.endTransparencyLayer()
            cg.restoreGState()
            mark.draw(in: rect)
        }.cgImage
    }

    /// Where the video goes (top-left origin). Scaled to cover the inside plus a
    /// little under the border, top-aligned, so any overflow goes under the ribbon.
    static func videoRect(content e: CGSize, size: CGSize) -> CGRect {
        let tuck = max(2, min(size.width, size.height) * 0.01)
        let area = layout(size: size).video.insetBy(dx: -tuck, dy: -tuck)
        let k = max(area.width / e.width, area.height / e.height)
        let w = e.width * k, h = e.height * k
        return CGRect(x: area.midX - w / 2, y: area.minY, width: w, height: h)
    }

    /// `rect` (top-left origin) in the bottom-left coordinates of Core Image / offline Core Animation.
    private static func flipped(_ rect: CGRect, _ size: CGSize) -> CGRect {
        CGRect(x: rect.minX, y: size.height - rect.maxY, width: rect.width, height: rect.height)
    }

    static func composite(_ content: CIImage, artwork: CGImage?, size: CGSize) -> CIImage {
        guard let artwork else { return content }
        let src = content.transformed(by: CGAffineTransform(translationX: -content.extent.minX, y: -content.extent.minY))
        let e = src.extent.size
        let layout = layout(size: size)
        let target = flipped(videoRect(content: e, size: size), size)
        let k = target.width / e.width
        let fitted = src.transformed(by: CGAffineTransform(scaleX: k, y: k))
            .transformed(by: CGAffineTransform(translationX: target.midX - e.width * k / 2,
                                              y: target.midY - e.height * k / 2))
        // Outside the frame's inside (below the ribbon, round corners): the frame's color.
        let canvas = CGRect(origin: .zero, size: size)
        let base = layout.backdrop.map { CIImage(cgImage: $0) }
            ?? CIImage(color: CIColor(red: 0.06, green: 0.06, blue: 0.09)).cropped(to: canvas)
        let inside = layout.mask.map {
            fitted.applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: base, kCIInputMaskImageKey: CIImage(cgImage: $0)])
        } ?? fitted.composited(over: base)
        return CIImage(cgImage: artwork).composited(over: inside.cropped(to: canvas))
    }

    static func decorate(_ parent: CALayer, size: CGSize) {
        guard let art = artwork(size: size) else { return }
        let content = CALayer()
        content.frame = CGRect(origin: .zero, size: size)
        let children = parent.sublayers ?? []
        for layer in children { layer.removeFromSuperlayer(); content.addSublayer(layer) }
        let target = flipped(videoRect(content: size, size: size), size)
        let k = target.width / size.width
        content.transform = CATransform3DMakeScale(k, k, 1)
        content.position = CGPoint(x: target.midX, y: target.midY)
        parent.backgroundColor = UIColor(white: 0.06, alpha: 1).cgColor
        if let backdrop = layout(size: size).backdrop {
            let b = CALayer()
            b.frame = CGRect(origin: .zero, size: size)
            b.contents = backdrop
            parent.addSublayer(b)
        }
        let clip = CALayer()
        clip.frame = CGRect(origin: .zero, size: size)
        if let mask = layout(size: size).mask {
            let m = CALayer()
            m.frame = clip.bounds
            m.contents = mask
            clip.mask = m
        }
        clip.addSublayer(content)
        parent.addSublayer(clip)
        let frame = CALayer()
        frame.frame = CGRect(origin: .zero, size: size)
        frame.contents = art
        parent.addSublayer(frame)
    }

    static func export(source: URL, to output: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw NSError(domain: "VideoBranding", code: 1, userInfo: [NSLocalizedDescriptionKey: "video track missing"])
        }
        let natural = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let bounds = CGRect(origin: .zero, size: natural).applying(transform)
        let size = CGSize(width: abs(bounds.width), height: abs(bounds.height))
        let art = artwork(size: size)
        guard art != nil else { throw NSError(domain: "VideoBranding", code: 2, userInfo: [NSLocalizedDescriptionKey: "video artwork missing"]) }
        let video = AVMutableVideoComposition(asset: asset) { request in
            autoreleasepool {
                let frame = request.sourceImage
                request.finish(with: composite(frame, artwork: art, size: size), context: nil)
            }
        }
        video.renderSize = size
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            throw NSError(domain: "VideoBranding", code: 3)
        }
        session.videoComposition = video
        session.outputURL = output
        session.outputFileType = .mov
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            session.exportAsynchronously {
                if session.status == .completed { c.resume() }
                else { c.resume(throwing: session.error ?? NSError(domain: "VideoBranding", code: 4)) }
            }
        }
    }
}
