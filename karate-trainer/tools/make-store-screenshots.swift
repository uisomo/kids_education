// App Store marketing screenshots: a headline band on top and the real app
// screen in a phone frame below (bleeding off the bottom edge), one PNG per
// slide and per size. Driven by a JSON spec so the piano app can reuse it:
//
//   swift karate-trainer/tools/make-store-screenshots.swift ~/Desktop/AppStore/karate/screenshots/slides.json
//
// Spec: { "out": "dir (relative to the spec)", "sizes": [[1320,2868],[1284,2778]], "folders": ["6.9inch","6.5inch"] (optional; default WxH),
//         "theme": { "top": "#hex", "bottom": "#hex", "title": "#hex", "sub": "#hex", "chip": "#hex", "chipText": "#hex" },
//         "slides": [{ "file": "01.png", "src": "src/x.png", "title": ["line", "line"], "sub": "…", "chips": ["…"] }] }
// Paths in the spec are relative to the spec file.

import AppKit
import Foundation

struct Theme: Decodable { let top, bottom, title, sub, chip, chipText: String }
struct Slide: Decodable { let file, src: String; let title: [String]; let sub: String?; let chips: [String]? }
struct Spec: Decodable { let out: String; let sizes: [[Int]]; let folders: [String]?; let theme: Theme; let slides: [Slide] }

func color(_ hex: String) -> NSColor {
    var v: UInt64 = 0
    Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                   blue: CGFloat(v & 0xff) / 255, alpha: 1)
}

func font(_ size: CGFloat, heavy: Bool) -> NSFont {
    NSFont(name: heavy ? "HiraginoSans-W8" : "HiraginoSans-W6", size: size) ?? .boldSystemFont(ofSize: size)
}

/// Draws one line centred at `y` (top-left origin), shrinking the font until it fits `maxWidth`.
/// Returns the line height used.
@discardableResult
func drawLine(_ text: String, y: CGFloat, width: CGFloat, maxWidth: CGFloat, size: CGFloat,
              heavy: Bool, color c: NSColor, shadow: Bool) -> CGFloat {
    var s = size
    var attrs: [NSAttributedString.Key: Any] = [:]
    var bounds = CGSize.zero
    repeat {
        attrs = [.font: font(s, heavy: heavy), .foregroundColor: c, .kern: s * 0.02]
        if shadow {
            let sh = NSShadow()
            sh.shadowColor = NSColor.black.withAlphaComponent(0.35)
            sh.shadowOffset = NSSize(width: 0, height: -s * 0.05)
            sh.shadowBlurRadius = s * 0.12
            attrs[.shadow] = sh
        }
        bounds = (text as NSString).size(withAttributes: attrs)
        s -= 2
    } while bounds.width > maxWidth && s > 20
    (text as NSString).draw(at: NSPoint(x: (width - bounds.width) / 2, y: y), withAttributes: attrs)
    return bounds.height
}

func render(_ slide: Slide, spec: Spec, base: URL, w: Int, h: Int) throws -> Data {
    let W = CGFloat(w), H = CGFloat(h)
    // RGB with no alpha channel: App Store Connect rejects screenshots with transparency.
    guard let cg = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                             space: CGColorSpace(name: CGColorSpace.sRGB)!,
                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { throw NSError(domain: "ctx", code: 1) }
    // Flip to a top-left origin so the layout reads top to bottom.
    cg.translateBy(x: 0, y: H)
    cg.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)

    let t = spec.theme
    NSGradient(starting: color(t.top), ending: color(t.bottom))!.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: 90)

    // Headline.
    var y = H * 0.05
    for line in slide.title {
        y += drawLine(line, y: y, width: W, maxWidth: W * 0.9, size: W * 0.088, heavy: true,
                      color: color(t.title), shadow: true) * 1.12
    }
    if let sub = slide.sub {
        y += W * 0.018
        y += drawLine(sub, y: y, width: W, maxWidth: W * 0.9, size: W * 0.043, heavy: false,
                      color: color(t.sub), shadow: false)
    }
    if let chips = slide.chips, !chips.isEmpty {
        y += W * 0.03
        let fs = W * 0.036
        let attrs: [NSAttributedString.Key: Any] = [.font: font(fs, heavy: true), .foregroundColor: color(t.chipText)]
        let padX = fs * 0.8, padY = fs * 0.45, gap = fs * 0.5
        let sizes = chips.map { ($0 as NSString).size(withAttributes: attrs) }
        let total = sizes.reduce(0) { $0 + $1.width + padX * 2 } + gap * CGFloat(chips.count - 1)
        var x = (W - total) / 2
        let chipH = sizes[0].height + padY * 2
        for (chip, sz) in zip(chips, sizes) {
            let r = NSRect(x: x, y: y, width: sz.width + padX * 2, height: chipH)
            color(t.chip).setFill()
            NSBezierPath(roundedRect: r, xRadius: chipH / 2, yRadius: chipH / 2).fill()
            (chip as NSString).draw(at: NSPoint(x: x + padX, y: y + padY), withAttributes: attrs)
            x += r.width + gap
        }
        y += chipH
    }

    // Phone: dark bezel + the real screen, clipped to rounded corners, running off the bottom.
    guard let shot = NSImage(contentsOf: base.appendingPathComponent(slide.src)) else {
        throw NSError(domain: "missing \(slide.src)", code: 2)
    }
    let phoneW = W * 0.8
    let bezel = phoneW * 0.028
    let screenW = phoneW - bezel * 2
    let screenH = screenW * shot.size.height / shot.size.width
    let phoneTop = max(y + W * 0.06, H * 0.24)
    let phone = NSRect(x: (W - phoneW) / 2, y: phoneTop, width: phoneW, height: screenH + bezel * 2)
    let phoneR = phoneW * 0.13

    NSGraphicsContext.saveGraphicsState()
    let sh = NSShadow()
    sh.shadowColor = NSColor.black.withAlphaComponent(0.45)
    sh.shadowBlurRadius = W * 0.04
    sh.shadowOffset = NSSize(width: 0, height: W * 0.012)
    sh.set()
    NSColor(srgbRed: 0.07, green: 0.07, blue: 0.09, alpha: 1).setFill()
    NSBezierPath(roundedRect: phone, xRadius: phoneR, yRadius: phoneR).fill()
    NSGraphicsContext.restoreGraphicsState()

    let screen = phone.insetBy(dx: bezel, dy: bezel)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: screen, xRadius: phoneR - bezel, yRadius: phoneR - bezel).addClip()
    shot.draw(in: screen, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.restoreGraphicsState()
    guard let img = cg.makeImage(),
          let png = NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:]) else { throw NSError(domain: "png", code: 3) }
    return png
}

let args = CommandLine.arguments
guard args.count > 1 else { print("usage: make-store-screenshots.swift <spec.json>"); exit(1) }
let specURL = URL(fileURLWithPath: (args[1] as NSString).expandingTildeInPath)
let base = specURL.deletingLastPathComponent()
let spec = try JSONDecoder().decode(Spec.self, from: Data(contentsOf: specURL))
for (i, size) in spec.sizes.enumerated() {
    let (w, h) = (size[0], size[1])
    let folder = spec.folders.flatMap { i < $0.count ? $0[i] : nil } ?? "\(w)x\(h)"
    let dir = base.appendingPathComponent(spec.out).appendingPathComponent(folder)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for slide in spec.slides {
        let png = try render(slide, spec: spec, base: base, w: w, h: h)
        try png.write(to: dir.appendingPathComponent(slide.file))
        print("wrote \(dir.lastPathComponent)/\(slide.file)")
    }
}
