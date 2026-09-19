// 使い方どうが: renders the how-to clips from real app screenshots.
//
//   swift karate-trainer/tools/howto/render-howto.swift <spec.json> <shots dir> <out dir>
//
// Each step shows one Simulator screenshot (1320×2868, status bar cropped)
// under a caption band, with a finger-tap ripple (or a drag trail) where the
// next touch lands. A title card opens each clip and an end card closes it.
// No ffmpeg on this Mac, so frames are drawn with CoreGraphics and encoded
// with AVAssetWriter (H.264, 30fps, silent).
import AppKit
import AVFoundation

struct Step: Decodable {
    let img: String
    let cap: String
    let tap: [Double]?        // points (440×956 space)
    let drag: [[Double]]?     // points, from → to
}
struct Clip: Decodable { let out: String; let title: String; let steps: [Step]; let end: String }

let args = CommandLine.arguments
let clips = try JSONDecoder().decode([Clip].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let shotsDir = URL(fileURLWithPath: args[2]), outDir = URL(fileURLWithPath: args[3])

let W = 600, H = 1416, capH = 180
let fps: Int32 = 30
let cropTop = 150.0                  // status bar (px of the 1320-wide shot)
let scale = Double(W) / 1320.0       // shot px → video px
let pt = 3.0                         // shot px per point

let bg = CGColor(red: 0.11, green: 0.10, blue: 0.20, alpha: 1)
let gold = NSColor(red: 1.0, green: 0.82, blue: 0.40, alpha: 1)

func loadImage(_ name: String) -> CGImage {
    let img = NSImage(contentsOf: shotsDir.appendingPathComponent(name))!
    var r = CGRect(origin: .zero, size: img.size)
    return img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
}

// Screenshot point → video pixel (CoreGraphics origin bottom-left).
func toVideo(_ x: Double, _ y: Double) -> CGPoint {
    CGPoint(x: x * pt * scale, y: Double(H - capH) - (y * pt - cropTop) * scale)
}

func drawText(_ ctx: CGContext, _ s: String, size: CGFloat, color: NSColor, in rect: CGRect) {
    let para = NSMutableParagraphStyle()
    para.alignment = .center
    para.lineBreakMode = .byWordWrapping
    para.lineSpacing = 4
    let font = NSFont(name: "HiraginoSans-W7", size: size) ?? NSFont.boldSystemFont(ofSize: size)
    let attr = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para])
    let fs = CTFramesetterCreateWithAttributedString(attr)
    let fit = CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(), nil, CGSize(width: rect.width, height: .greatestFiniteMagnitude), nil)
    let r = CGRect(x: rect.minX, y: rect.midY - fit.height / 2, width: rect.width, height: fit.height + 2)
    CTFrameDraw(CTFramesetterCreateFrame(fs, CFRange(), CGPath(rect: r, transform: nil), nil), ctx)
}

func drawShot(_ ctx: CGContext, _ img: CGImage, alpha: CGFloat) {
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 0, y: 0, width: W, height: H - capH))   // status bar stays hidden
    ctx.setAlpha(alpha)
    let h = Double(img.height) * scale
    ctx.draw(img, in: CGRect(x: 0, y: Double(H - capH) - h + cropTop * scale, width: Double(W), height: h))
    ctx.restoreGState()
}

// Japanese has no word spaces, so CoreText would break mid-word; captions
// mark phrase gaps with spaces and this breaks at the one nearest the middle.
func balanced(_ text: String, size: CGFloat, width: CGFloat) -> String {
    let font = NSFont(name: "HiraginoSans-W7", size: size) ?? NSFont.boldSystemFont(ofSize: size)
    let w = (text as NSString).size(withAttributes: [.font: font]).width
    let chars = Array(text)
    let spaces = chars.indices.filter { chars[$0] == " " }
    guard w > width, !spaces.isEmpty else { return text }
    let mid = chars.count / 2
    let cut = spaces.min { abs($0 - mid) < abs($1 - mid) }!
    return String(chars[..<cut]) + "\n" + String(chars[(cut + 1)...])
}

func drawCaption(_ ctx: CGContext, _ text: String, _ index: Int, _ total: Int) {
    ctx.setFillColor(bg)
    ctx.fill(CGRect(x: 0, y: H - capH, width: W, height: capH))
    ctx.setFillColor(gold.cgColor)
    ctx.fill(CGRect(x: 0, y: H - capH, width: W, height: 6))
    drawText(ctx, "\(index)/\(total)", size: 22, color: gold, in: CGRect(x: 0, y: H - 50, width: W, height: 40))
    drawText(ctx, balanced(text, size: 32, width: CGFloat(W - 60)), size: 32, color: .white,
             in: CGRect(x: 30, y: H - capH + 10, width: W - 60, height: capH - 60))
}

// A fingertip: a shrinking ring that lands as a filled dot.
func drawTap(_ ctx: CGContext, at p: CGPoint, t: Double) {
    guard t > 0 else { return }
    let land = min(1, t / 0.35)
    let radius = 60 - 36 * land
    let ring = CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2)
    ctx.setStrokeColor(CGColor(red: 0.1, green: 0.05, blue: 0.2, alpha: 0.8))
    ctx.setLineWidth(12)
    ctx.strokeEllipse(in: ring)
    ctx.setStrokeColor(CGColor(red: 1, green: 0.85, blue: 0.2, alpha: 0.95))
    ctx.setLineWidth(7)
    ctx.strokeEllipse(in: ring)
    if land >= 1 {
        let pulse = 0.5 + 0.5 * sin((t - 0.35) * 7)
        ctx.setFillColor(CGColor(red: 1, green: 0.85, blue: 0.2, alpha: 0.35 + 0.25 * pulse))
        ctx.fillEllipse(in: CGRect(x: p.x - 24, y: p.y - 24, width: 48, height: 48))
    }
}

func drawDrag(_ ctx: CGContext, from a: CGPoint, to b: CGPoint, t: Double) {
    guard t > 0 else { return }
    let k = min(1, max(0, (t - 0.3) / 1.2))
    let e = k * k * (3 - 2 * k)
    let p = CGPoint(x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e)
    ctx.setStrokeColor(CGColor(red: 1, green: 0.85, blue: 0.2, alpha: 0.7))
    ctx.setLineWidth(10)
    ctx.setLineCap(.round)
    ctx.setLineDash(phase: 0, lengths: [2, 20])
    ctx.move(to: a); ctx.addLine(to: p); ctx.strokePath()
    ctx.setLineDash(phase: 0, lengths: [])
    drawTap(ctx, at: p, t: 1)
}

func render(_ clip: Clip) throws {
    let url = outDir.appendingPathComponent(clip.out)
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 900_000,
                                          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
    ])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W,
        kCVPixelBufferHeightKey as String: H,
    ])
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    var frame: Int64 = 0

    func emit(seconds: Double, _ draw: (CGContext, Double) -> Void) {
        let n = Int(seconds * Double(fps))
        for i in 0..<n {
            while !input.isReadyForMoreMediaData { usleep(1000) }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
            CVPixelBufferLockBaseAddress(pb!, [])
            let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8,
                                bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
            ctx.setFillColor(bg)
            ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
            NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
            draw(ctx, Double(i) / Double(fps))
            CVPixelBufferUnlockBaseAddress(pb!, [])
            adaptor.append(pb!, withPresentationTime: CMTime(value: frame, timescale: fps))
            frame += 1
        }
    }

    let first = loadImage(clip.steps[0].img)
    emit(seconds: 1.8) { ctx, t in
        drawShot(ctx, first, alpha: 0.25)
        drawText(ctx, "つかいかた", size: 30, color: gold, in: CGRect(x: 0, y: H / 2 + 40, width: W, height: 60))
        drawText(ctx, clip.title, size: 52, color: .white, in: CGRect(x: 30, y: H / 2 - 70, width: W - 60, height: 120))
    }
    var prev: CGImage? = first
    for (i, s) in clip.steps.enumerated() {
        let img = loadImage(s.img)
        let dur = s.drag != nil ? 3.2 : (s.tap != nil ? 2.8 : 2.6)
        emit(seconds: dur) { ctx, t in
            if let p = prev, t < 0.25 { drawShot(ctx, p, alpha: 1) }
            drawShot(ctx, img, alpha: CGFloat(min(1, t / 0.25)))
            if let tap = s.tap { drawTap(ctx, at: toVideo(tap[0], tap[1]), t: t - 0.7) }
            if let d = s.drag { drawDrag(ctx, from: toVideo(d[0][0], d[0][1]), to: toVideo(d[1][0], d[1][1]), t: t - 0.5) }
            drawCaption(ctx, s.cap, i + 1, clip.steps.count)
        }
        prev = img
    }
    let last = prev!
    emit(seconds: 2.6) { ctx, t in
        drawShot(ctx, last, alpha: 0.25)
        drawText(ctx, balanced(clip.end, size: 40, width: CGFloat(W - 80)), size: 40, color: .white, in: CGRect(x: 40, y: H / 2 - 150, width: W - 80, height: 300))
    }

    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "render", code: 1) }
    print("wrote \(clip.out) (\(frame) frames)")
}

for c in clips { try render(c) }
