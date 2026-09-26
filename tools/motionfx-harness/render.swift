import Foundation
import AVFoundation
import CoreGraphics
import CoreImage
import ImageIO
import UniformTypeIdentifiers

/// **アプリの書き出しと同じ道を通す。** かざりを CGContext に直接描くのをやめて、
/// `OverlayRasterizer.composite`（空気 → にじみ → 光）を通す。そうしないと
/// ブルームの入った「アプリが作る絵」と、ここで見る絵が別物になる。
private let fxCIContext = CIContext(options: [.cacheIntermediates: false])

private func composed(frame cg: CGImage, timeline: EffectTimeline, preset: EffectPreset,
                      rasterizer: OverlayRasterizer, at t: Double) -> CGImage? {
    let rect = CGRect(x: 0, y: 0, width: cg.width, height: cg.height)
    let scene = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
    let base = CIImage(cgImage: cg)
    guard let out = try? rasterizer.composite(scene: scene, over: base, outputRect: rect) else { return cg }
    // **sRGB で書き出すこと。** 指定しないと CIContext の作業空間（線形）のまま
    // 出てきて、かざりの無いところまで色が変わる（絵を比べられなくなる）。
    return fxCIContext.createCGImage(out.cropped(to: rect), from: rect,
                                     format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
}

private func generator(_ video: URL, maximumSize: CGSize? = nil) -> AVAssetImageGenerator {
    let gen = AVAssetImageGenerator(asset: AVURLAsset(url: video))
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    if let maximumSize { gen.maximumSize = maximumSize }
    return gen
}

func renderProof(video: URL, timeline: EffectTimeline, preset: EffectPreset, catalog: EffectCatalog,
                 times: [Double], outDir: URL, tag: String) {
    let gen = generator(video)
    let rasterizer = OverlayRasterizer(catalog: catalog)
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    for t in times {
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil),
              let img = composed(frame: cg, timeline: timeline, preset: preset, rasterizer: rasterizer, at: t)
        else { continue }
        let count = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false).primitives.count
        let url = outDir.appendingPathComponent(String(format: "%@_%.2fs_p%d.jpg", tag, t, count))
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
    let gen = generator(video, maximumSize: CGSize(width: 420, height: 420))
    let rasterizer = OverlayRasterizer(catalog: catalog)
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let url = outDir.appendingPathComponent("\(tag).gif")
    let count = max(1, Int(seconds*fps))
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, count, nil) else { return }
    CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
    for i in 0..<count {
        let t = start+Double(i)/fps
        guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil),
              let img = composed(frame: cg, timeline: timeline, preset: preset, rasterizer: rasterizer, at: t)
        else { continue }
        CGImageDestinationAddImage(dest, img, [kCGImagePropertyGIFDictionary:
            [kCGImagePropertyGIFDelayTime: 1.0/fps]] as CFDictionary)
    }
    if CGImageDestinationFinalize(dest) { print("  clip \(url.lastPathComponent)") }
}
