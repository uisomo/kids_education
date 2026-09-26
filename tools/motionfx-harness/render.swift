import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func renderProof(video: URL, timeline: EffectTimeline, preset: EffectPreset, catalog: EffectCatalog,
                 times: [Double], outDir: URL, tag: String) {
    let gen = AVAssetImageGenerator(asset: AVURLAsset(url: video))
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    for t in times {
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
        let w = cg.width, h = cg.height
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scene = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
        ctx.saveGState()
        ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: 1, y: -1)
        EffectPainter.draw(scene, in: ctx, viewport: CGSize(width: w, height: h), catalog: catalog)
        ctx.restoreGState()
        guard let img = ctx.makeImage() else { continue }
        let url = outDir.appendingPathComponent(String(format: "%@_%.2fs_p%d.jpg", tag, t, scene.primitives.count))
        if let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) {
            CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
            CGImageDestinationFinalize(dest)
            print("  proof \(url.lastPathComponent)")
        }
    }
}

/// 動く絵（GIF）。**回るものは静止画では確かめられない。** 渦は回っているか、
/// 稲妻はパチパチしているか、ちらついていないか — それを見るためだけのもの。
/// `FXCLIP=<開始秒>` を付けて走らせると出る。
func renderClip(video: URL, timeline: EffectTimeline, preset: EffectPreset, catalog: EffectCatalog,
                start: Double, seconds: Double, fps: Double, outDir: URL, tag: String) {
    let asset = AVURLAsset(url: video)
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    gen.maximumSize = CGSize(width: 420, height: 420)
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let url = outDir.appendingPathComponent("\(tag).gif")
    let count = max(1, Int(seconds*fps))
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, count, nil) else { return }
    CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
    for i in 0..<count {
        let t = start+Double(i)/fps
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
        let w = cg.width, h = cg.height
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scene = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
        ctx.saveGState()
        ctx.translateBy(x: 0, y: CGFloat(h)); ctx.scaleBy(x: 1, y: -1)
        EffectPainter.draw(scene, in: ctx, viewport: CGSize(width: w, height: h), catalog: catalog)
        ctx.restoreGState()
        guard let img = ctx.makeImage() else { continue }
        CGImageDestinationAddImage(dest, img, [kCGImagePropertyGIFDictionary:
            [kCGImagePropertyGIFDelayTime: 1.0/fps]] as CFDictionary)
    }
    if CGImageDestinationFinalize(dest) { print("  clip \(url.lastPathComponent)") }
}

