// App Store marketing screenshots: a headline band on top and the real app
// screen in a phone frame below (bleeding off the bottom edge), one PNG per
// slide and per size. Driven by a JSON spec so the piano app can reuse it:
//
//   swift karate-trainer/tools/make-store-screenshots.swift appstore/karate/screenshots/slides.json
//   swift karate-trainer/tools/make-store-screenshots.swift appstore/piano/screenshots/slides.json
//
// Look: the series' glossy 3D style (アランの基盤 SERIES_GUIDE 5.2 / 5.2c / 5.2d) — soft glossy gradient
// background with a few shiny bubbles, chunky M PLUS Rounded 1c headline with gradient fill + white top
// highlight + darker rim + soft shadow, glossy brand icons scattered as decoration, a glossy phone frame,
// and optionally one glossy character peeking from behind the phone's top corner.
//
// Spec: { "out": "dir (relative to the spec)", "sizes": [[1320,2868],[1284,2778]], "folders": ["6.9inch","6.5inch"] (optional; default WxH),
//         "theme": { "top": "#hex", "bottom": "#hex", "title": "#hex", "sub": "#hex", "chip": "#hex", "chipText": "#hex",
//                    "titleColors": ["#hex", …] (optional; one per headline line, cycles),
//                    "brand": "path to アランの基盤/brand" (optional; fonts, icons and characters come from here),
//                    "icons": ["star", "flame", …] (optional; glossy icons from <brand>/icons/png/plain/<name>.png, scattered in the margins),
//                    "frame": ["#hex top", "#hex bottom"] (optional; phone frame gradient, default glossy white) },
//         "slides": [{ "file": "01.png", "src": "src/x.png", "title": ["line", "line"], "sub": "…", "chips": ["…"],
//                      "character": { "name": "alan-cheer", "side": "left" | "right" } (optional; <brand>/characters/<name>.png) }] }
// Paths in the spec are relative to the spec file. Output is RGB PNG with no alpha (App Store Connect rule).

import AppKit
import CoreText
import Foundation

struct Theme: Decodable {
    let top, bottom, title, sub, chip, chipText: String
    let titleColors: [String]?
    let brand: String?
    let icons: [String]?
    let frame: [String]?
}
struct Character: Decodable { let name: String; let side: String? }
struct Slide: Decodable { let file, src: String; let title: [String]; let sub: String?; let chips: [String]?; let character: Character? }
struct Spec: Decodable { let out: String; let sizes: [[Int]]; let folders: [String]?; let theme: Theme; let slides: [Slide] }

func color(_ hex: String) -> NSColor {
    var v: UInt64 = 0
    Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
    return NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
                   blue: CGFloat(v & 0xff) / 255, alpha: 1)
}
extension NSColor {
    func lighter(_ f: CGFloat) -> NSColor { blended(withFraction: f, of: .white) ?? self }
    func darker(_ f: CGFloat) -> NSColor { blended(withFraction: f, of: .black) ?? self }
    func a(_ x: CGFloat) -> NSColor { withAlphaComponent(x) }
}

// MARK: fonts

let fontExtraBold = "RoundedMplus1c-ExtraBold"   // PostScript name inside MPLUSRounded1c-ExtraBold.ttf
let fontMedium = "RoundedMplus1c-Medium"

/// Registers the series font from <brand>/fonts so it is used even when it is not installed on the Mac.
func registerFonts(brand: URL?) {
    guard let dir = brand?.appendingPathComponent("fonts") else { return }
    for f in ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Medium.ttf"] {
        let url = dir.appendingPathComponent(f)
        if FileManager.default.fileExists(atPath: url.path) {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

func font(_ size: CGFloat, heavy: Bool) -> NSFont {
    NSFont(name: heavy ? fontExtraBold : fontMedium, size: size)
        ?? NSFont(name: heavy ? "HiraginoSans-W8" : "HiraginoSans-W6", size: size) ?? .boldSystemFont(ofSize: size)
}

// MARK: glossy lettering

/// One line of text as a vector path in a top-left (y-down) space, baseline at y = 0.
struct TextShape { let path: CGPath; let width, ascent, descent: CGFloat }

func textShape(_ text: String, size: CGFloat) -> TextShape {
    let f = font(size, heavy: true)
    let str = NSAttributedString(string: text, attributes: [.font: f, .kern: size * 0.01])
    let line = CTLineCreateWithAttributedString(str)
    var asc: CGFloat = 0, desc: CGFloat = 0, lead: CGFloat = 0
    let width = CGFloat(CTLineGetTypographicBounds(line, &asc, &desc, &lead))
    let path = CGMutablePath()
    for run in CTLineGetGlyphRuns(line) as! [CTRun] {
        let attrs = CTRunGetAttributes(run) as NSDictionary
        let runFont = attrs[kCTFontAttributeName as String] as! CTFont   // fallback fonts included
        let n = CTRunGetGlyphCount(run)
        var glyphs = [CGGlyph](repeating: 0, count: n), pos = [CGPoint](repeating: .zero, count: n)
        CTRunGetGlyphs(run, CFRange(location: 0, length: n), &glyphs)
        CTRunGetPositions(run, CFRange(location: 0, length: n), &pos)
        for i in 0..<n {
            var t = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: pos[i].x, ty: -pos[i].y)
            if let g = CTFontCreatePathForGlyph(runFont, glyphs[i], &t) { path.addPath(g) }
        }
    }
    return TextShape(path: path, width: width, ascent: asc, descent: desc)
}

/// Glossy lettering: white sticker halo with a soft shadow, darker rim, top-to-bottom gradient fill
/// and a white shine across the top half — the same recipe as the glossy icons.
func drawGlossyText(_ cg: CGContext, _ shape: TextShape, at o: CGPoint, size s: CGFloat, color c: NSColor, halo: Bool) {
    var t = CGAffineTransform(translationX: o.x, y: o.y)
    guard let p = shape.path.copy(using: &t) else { return }
    let top = o.y - shape.ascent * 0.82, bottom = o.y + shape.descent * 0.2
    cg.saveGState()
    cg.setLineJoin(.round); cg.setLineCap(.round)
    if halo {
        // Shadow offsets live in device space (y-up): negative height = downward.
        cg.setShadow(offset: CGSize(width: 0, height: -s * 0.07), blur: s * 0.16, color: c.darker(0.55).a(0.35).cgColor)
        cg.addPath(p); cg.setLineWidth(s * 0.24); cg.setStrokeColor(NSColor.white.cgColor); cg.strokePath()
        cg.setShadow(offset: .zero, blur: 0, color: nil)
    }
    // Darker rim (half of it is covered by the fill → a puffy edge).
    cg.addPath(p); cg.setLineWidth(s * 0.05); cg.setStrokeColor(c.darker(0.3).cgColor); cg.strokePath()
    // Gradient body.
    cg.saveGState()
    cg.addPath(p); cg.clip()
    cg.drawLinearGradient(gradient([c.lighter(0.28), c, c.darker(0.18)], [0, 0.55, 1]),
                          start: CGPoint(x: 0, y: top), end: CGPoint(x: 0, y: bottom), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    // Top shine.
    cg.clip(to: CGRect(x: o.x - s, y: top - s, width: shape.width + s * 2, height: (bottom - top) * 0.46 + s))
    cg.drawLinearGradient(gradient([NSColor.white.a(0.75), NSColor.white.a(0.12)]),
                          start: CGPoint(x: 0, y: top), end: CGPoint(x: 0, y: top + (bottom - top) * 0.46), options: [.drawsBeforeStartLocation])
    cg.restoreGState()
    cg.restoreGState()
}

/// Shrinks `size` until the line fits `maxWidth`.
func fitShape(_ text: String, size: CGFloat, maxWidth: CGFloat) -> (TextShape, CGFloat) {
    var s = size
    var shape = textShape(text, size: s)
    while shape.width > maxWidth && s > 20 { s -= 2; shape = textShape(text, size: s) }
    return (shape, s)
}

/// Plain subtitle line (rounded bold with a white halo), centred, shrink-to-fit. Returns the height used.
@discardableResult
func drawSub(_ text: String, y: CGFloat, width: CGFloat, maxWidth: CGFloat, size: CGFloat, color c: NSColor, draw: Bool = true) -> CGFloat {
    var s = size
    var attrs: [NSAttributedString.Key: Any] = [:]
    var bounds = CGSize.zero
    repeat {
        attrs = [.font: font(s, heavy: true), .foregroundColor: c, .kern: s * 0.02]
        bounds = (text as NSString).size(withAttributes: attrs)
        s -= 2
    } while bounds.width > maxWidth && s > 20
    guard draw else { return bounds.height }
    let at = NSPoint(x: (width - bounds.width) / 2, y: y)
    var halo = attrs
    halo[.strokeColor] = NSColor.white.a(0.85)
    halo[.strokeWidth] = 16.0
    (text as NSString).draw(at: at, withAttributes: halo)
    (text as NSString).draw(at: at, withAttributes: attrs)
    return bounds.height
}

// MARK: glossy shapes

/// Small deterministic RNG so every run places decorations the same way.
struct Rand { var s: UInt64
    mutating func next() -> CGFloat { s = s &* 6364136223846793005 &+ 1442695040888963407; return CGFloat((s >> 33) % 10_000) / 10_000 }
    mutating func jit(_ r: CGFloat) -> CGFloat { (next() * 2 - 1) * r }
}

let rgb = CGColorSpace(name: CGColorSpace.sRGB)!
func gradient(_ cs: [NSColor], _ locs: [CGFloat]? = nil) -> CGGradient {
    CGGradient(colorsSpace: rgb, colors: cs.map { $0.usingColorSpace(.sRGB)!.cgColor } as CFArray, locations: locs)!
}

/// A glossy pill / rounded rect: gradient body, darker rim, white shine on the top half, soft shadow.
func glossyRoundRect(_ cg: CGContext, _ r: CGRect, radius: CGFloat, color c: NSColor, shadow: CGFloat) {
    let p = CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -shadow * 0.5), blur: shadow, color: c.darker(0.5).a(0.35).cgColor)
    cg.addPath(p); cg.setFillColor(c.darker(0.22).cgColor); cg.fillPath()
    cg.restoreGState()
    cg.saveGState()
    let inner = r.insetBy(dx: radius * 0.08, dy: radius * 0.08)
    let ir = radius * 0.92
    cg.addPath(CGPath(roundedRect: inner, cornerWidth: ir, cornerHeight: ir, transform: nil)); cg.clip()
    cg.drawLinearGradient(gradient([c.lighter(0.25), c, c.darker(0.1)], [0, 0.55, 1]),
                          start: CGPoint(x: 0, y: inner.minY), end: CGPoint(x: 0, y: inner.maxY), options: [])
    let shineR = CGRect(x: inner.minX + inner.height * 0.2, y: inner.minY + inner.height * 0.07,
                        width: inner.width - inner.height * 0.4, height: inner.height * 0.4)
    cg.addPath(CGPath(roundedRect: shineR, cornerWidth: shineR.height / 2, cornerHeight: shineR.height / 2, transform: nil)); cg.clip()
    cg.drawLinearGradient(gradient([NSColor.white.a(0.7), NSColor.white.a(0.08)]),
                          start: CGPoint(x: 0, y: shineR.minY), end: CGPoint(x: 0, y: shineR.maxY), options: [])
    cg.restoreGState()
}

/// Soft glossy background: vertical brand gradient, a bright glow behind the headline and a few shiny bubbles.
func drawBackground(_ cg: CGContext, theme t: Theme, W: CGFloat, H: CGFloat, seed: Int) {
    cg.drawLinearGradient(gradient([color(t.top), color(t.bottom)]), start: .zero, end: CGPoint(x: 0, y: H), options: [])
    // Glow behind the headline keeps the text readable.
    let g = CGPoint(x: W / 2, y: H * 0.09)
    cg.drawRadialGradient(gradient([NSColor.white.a(0.65), NSColor.white.a(0)]), startCenter: g, startRadius: 0,
                          endCenter: g, endRadius: W * 0.75, options: [])
    // Diagonal light sweep.
    cg.saveGState()
    cg.translateBy(x: W * 0.5, y: H * 0.45); cg.rotate(by: -0.5)
    cg.drawLinearGradient(gradient([NSColor.white.a(0), NSColor.white.a(0.16), NSColor.white.a(0)], [0, 0.5, 1]),
                          start: CGPoint(x: 0, y: -W * 0.35), end: CGPoint(x: 0, y: W * 0.35), options: [])
    cg.restoreGState()
    var rng = Rand(s: UInt64(seed) &* 2654435761 &+ 99)
    // (x%, y%, radius as % of W)
    let bubbles: [(CGFloat, CGFloat, CGFloat)] = [(-4, 18, 16), (104, 30, 20), (2, 58, 13), (100, 70, 15), (-2, 92, 18), (96, 97, 11), (80, 1, 9)]
    for b in bubbles {
        let c = CGPoint(x: (b.0 + rng.jit(2)) * W / 100, y: (b.1 + rng.jit(2)) * H / 100)
        let r = b.2 * W / 100 * (0.9 + rng.next() * 0.2)
        cg.drawRadialGradient(gradient([NSColor.white.a(0.05), NSColor.white.a(0.28)]), startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [])
        // Rim + shine spot, like a glossy ball.
        cg.setStrokeColor(NSColor.white.a(0.35).cgColor); cg.setLineWidth(r * 0.03)
        cg.strokeEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
        let hs = CGPoint(x: c.x - r * 0.42, y: c.y - r * 0.45)
        cg.drawRadialGradient(gradient([NSColor.white.a(0.75), NSColor.white.a(0)]), startCenter: hs, startRadius: 0, endCenter: hs, endRadius: r * 0.3, options: [])
    }
}

/// Draws an image (respecting the flipped context) centred at `c`, `w` wide, rotated, with a soft shadow.
func drawImage(_ cg: CGContext, _ img: NSImage, center c: CGPoint, width w: CGFloat, rot: CGFloat, shadow: NSColor) {
    let h = w * img.size.height / img.size.width
    cg.saveGState()
    cg.translateBy(x: c.x, y: c.y); cg.rotate(by: rot)
    cg.setShadow(offset: CGSize(width: 0, height: -w * 0.04), blur: w * 0.1, color: shadow.cgColor)
    img.draw(in: NSRect(x: -w / 2, y: -h / 2, width: w, height: h), from: .zero, operation: .sourceOver, fraction: 1,
             respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    cg.restoreGState()
}

/// Glossy icons scattered in the margins (headline corners and the strips beside the phone).
func drawIcons(_ cg: CGContext, icons: [NSImage], W: CGFloat, H: CGFloat, seed: Int, avoid: [CGRect], shadow: NSColor) {
    guard !icons.isEmpty else { return }
    var rng = Rand(s: UInt64(seed) &* 2654435761 &+ 17)
    let u = W / 100
    // (x%, y%, size as % of W) — kept off the headline centre and the phone.
    let spots: [(CGFloat, CGFloat, CGFloat)] = [
        (7, 3.4, 9.5), (93, 3.6, 8.5), (5.5, 17.5, 7), (94.5, 18, 7.5),
        (5, 32, 8), (95, 44, 7.5), (5, 58, 7), (95, 70, 8), (5, 84, 7.5), (95, 94, 7),
    ]
    for (i, s) in spots.enumerated() {
        let c = CGPoint(x: s.0 * u + rng.jit(u * 0.5), y: s.1 * H / 100 + rng.jit(u * 0.5))
        let w = s.2 * u * (0.9 + rng.next() * 0.2)
        let rot = rng.jit(0.35)
        let box = CGRect(x: c.x - w * 0.5, y: c.y - w * 0.5, width: w, height: w)
        if avoid.contains(where: { $0.intersects(box) }) { continue }        // never over text or the character
        drawImage(cg, icons[(i + seed) % icons.count], center: c, width: w, rot: rot, shadow: shadow)
    }
}

func render(_ slide: Slide, spec: Spec, base: URL, brand: URL?, icons: [NSImage], w: Int, h: Int) throws -> Data {
    let W = CGFloat(w), H = CGFloat(h)
    // RGB with no alpha channel: App Store Connect rejects screenshots with transparency.
    guard let cg = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                             space: rgb, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { throw NSError(domain: "ctx", code: 1) }
    // Flip to a top-left origin so the layout reads top to bottom.
    cg.translateBy(x: 0, y: H)
    cg.scaleBy(x: 1, y: -1)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)

    let t = spec.theme
    let index = spec.slides.firstIndex { $0.file == slide.file } ?? 0
    let deep = color(t.bottom).darker(0.55)          // tint for soft shadows
    drawBackground(cg, theme: t, W: W, H: H, seed: index)

    // Layout pass: headline lines, subtitle, chips (drawn after the decorations).
    var y = H * 0.05
    var lines: [(TextShape, CGFloat, CGFloat, NSColor)] = []     // shape, top y, font size, colour
    for (i, line) in slide.title.enumerated() {
        let c = t.titleColors.map { color($0[i % $0.count]) } ?? color(t.title)
        let (shape, s) = fitShape(line, size: W * 0.092, maxWidth: W * 0.84)
        lines.append((shape, y, s, c))
        y += (shape.ascent + shape.descent) * 0.98
    }
    var textRects = lines.map { CGRect(x: (W - $0.0.width) / 2, y: $0.1, width: $0.0.width, height: $0.0.ascent + $0.0.descent) }
    let subY = y + W * 0.02
    if let sub = slide.sub {
        y = subY + drawSub(sub, y: subY, width: W, maxWidth: W * 0.9, size: W * 0.043, color: color(t.sub), draw: false)
        let sw = min(W * 0.9, (sub as NSString).size(withAttributes: [.font: font(W * 0.043, heavy: true)]).width)
        textRects.append(CGRect(x: (W - sw) / 2, y: subY, width: sw, height: y - subY))
    }
    let chipFS = W * 0.036
    let chipsY = y + W * 0.03
    if let chips = slide.chips, !chips.isEmpty {
        y = chipsY + (chips[0] as NSString).size(withAttributes: [.font: font(chipFS, heavy: true)]).height + chipFS * 0.9
        textRects.append(CGRect(x: W * 0.05, y: chipsY, width: W * 0.9, height: y - chipsY))
    }

    // Phone geometry.
    guard let shot = NSImage(contentsOf: base.appendingPathComponent(slide.src)) else {
        throw NSError(domain: "missing \(slide.src)", code: 2)
    }
    let phoneW = W * 0.8
    let frameW = phoneW * 0.032
    let ring = phoneW * 0.008
    let screenW = phoneW - (frameW + ring) * 2
    let screenH = screenW * shot.size.height / shot.size.width
    // A peeking character needs room above the phone so it never covers the text.
    let peek: CGFloat = 0.6                                  // share of the character above the phone edge
    let charMinH = H * 0.115
    let phoneTop = max(y + W * 0.06, H * 0.24, slide.character == nil ? 0 : y + W * 0.015 + charMinH * peek)
    let phone = CGRect(x: (W - phoneW) / 2, y: phoneTop, width: phoneW, height: screenH + (frameW + ring) * 2)
    let phoneR = phoneW * 0.13

    // Optional character peeking over the phone's top corner (drawn behind the phone, never on the screen).
    var charRect: CGRect?
    var charImage: NSImage?
    if let ch = slide.character {
        if let brand = brand, let img = NSImage(contentsOf: brand.appendingPathComponent("characters/\(ch.name).png")) {
            let room = phoneTop - (y + W * 0.015)             // free space between the text and the phone
            let chH = min(H * 0.15, room / peek)
            let chW = chH * img.size.width / img.size.height
            let right = (ch.side ?? "right") != "left"
            let cx = right ? min(phone.maxX - chW * 0.1, W - chW * 0.38) : max(phone.minX + chW * 0.1, chW * 0.38)
            charRect = CGRect(x: cx - chW / 2, y: phoneTop - chH * peek, width: chW, height: chH)
            charImage = img
        } else {
            print("warning: character \(ch.name) not found")
        }
    }

    drawIcons(cg, icons: icons, W: W, H: H, seed: index, avoid: textRects + (charRect.map { [$0] } ?? []), shadow: deep.a(0.28))

    for (shape, ly, s, c) in lines {
        drawGlossyText(cg, shape, at: CGPoint(x: (W - shape.width) / 2, y: ly + shape.ascent), size: s, color: c, halo: true)
    }
    if let sub = slide.sub {
        drawSub(sub, y: subY, width: W, maxWidth: W * 0.9, size: W * 0.043, color: color(t.sub))
    }
    if let chips = slide.chips, !chips.isEmpty {
        let attrs: [NSAttributedString.Key: Any] = [.font: font(chipFS, heavy: true), .foregroundColor: color(t.chipText)]
        let padX = chipFS * 0.9, padY = chipFS * 0.45, gap = chipFS * 0.5
        let sizes = chips.map { ($0 as NSString).size(withAttributes: attrs) }
        let total = sizes.reduce(0) { $0 + $1.width + padX * 2 } + gap * CGFloat(chips.count - 1)
        var x = (W - total) / 2
        let chipH = sizes[0].height + padY * 2
        for (chip, sz) in zip(chips, sizes) {
            let r = CGRect(x: x, y: chipsY, width: sz.width + padX * 2, height: chipH)
            glossyRoundRect(cg, r, radius: chipH / 2, color: color(t.chip), shadow: chipFS * 0.35)
            let sh = NSShadow()
            sh.shadowColor = color(t.chip).darker(0.5).a(0.5)
            sh.shadowOffset = NSSize(width: 0, height: -chipFS * 0.04)
            sh.shadowBlurRadius = chipFS * 0.08
            var a = attrs; a[.shadow] = sh
            (chip as NSString).draw(at: NSPoint(x: x + padX, y: chipsY + padY), withAttributes: a)
            x += r.width + gap
        }
    }

    if let img = charImage, let r = charRect {
        drawImage(cg, img, center: CGPoint(x: r.midX, y: r.midY), width: r.width, rot: 0, shadow: deep.a(0.3))
    }

    // Phone: glossy rounded frame (gradient + corner shine + darker rim + soft shadow), thin dark bezel, real screen.
    let frameCols = (t.frame ?? ["#FFFFFF", "#E9E4F2"]).map(color)
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -W * 0.018), blur: W * 0.06, color: deep.a(0.4).cgColor)
    cg.addPath(CGPath(roundedRect: phone, cornerWidth: phoneR, cornerHeight: phoneR, transform: nil))
    cg.setFillColor(frameCols[1].darker(0.25).cgColor); cg.fillPath()
    cg.restoreGState()
    let rim = frameW * 0.14
    let body = phone.insetBy(dx: rim, dy: rim)
    let bodyR = phoneR - rim
    cg.saveGState()
    cg.addPath(CGPath(roundedRect: body, cornerWidth: bodyR, cornerHeight: bodyR, transform: nil)); cg.clip()
    cg.drawLinearGradient(gradient([frameCols[0], frameCols[1]]), start: CGPoint(x: body.minX, y: body.minY),
                          end: CGPoint(x: body.maxX, y: body.minY + body.width * 1.2), options: [.drawsAfterEndLocation])
    let shineC = CGPoint(x: body.minX + bodyR * 0.5, y: body.minY + bodyR * 0.5)
    cg.drawRadialGradient(gradient([NSColor.white.a(0.95), NSColor.white.a(0)]), startCenter: shineC, startRadius: 0,
                          endCenter: shineC, endRadius: phoneW * 0.55, options: [])
    cg.restoreGState()

    let bezel = phone.insetBy(dx: frameW, dy: frameW)
    let bezelR = phoneR - frameW
    cg.addPath(CGPath(roundedRect: bezel, cornerWidth: bezelR, cornerHeight: bezelR, transform: nil))
    cg.setFillColor(NSColor(srgbRed: 0.07, green: 0.07, blue: 0.09, alpha: 1).cgColor); cg.fillPath()
    let screen = bezel.insetBy(dx: ring, dy: ring)
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: screen, xRadius: bezelR - ring, yRadius: bezelR - ring).addClip()
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
let brand = spec.theme.brand.map { base.appendingPathComponent($0).standardizedFileURL }
if let b = brand, !FileManager.default.fileExists(atPath: b.path) { print("warning: brand folder not found: \(b.path)") }
registerFonts(brand: brand)
if NSFont(name: fontExtraBold, size: 12) == nil { print("warning: M PLUS Rounded 1c not found — falling back to Hiragino") }
let icons: [NSImage] = (spec.theme.icons ?? []).compactMap { name in
    guard let b = brand, let img = NSImage(contentsOf: b.appendingPathComponent("icons/png/plain/\(name).png")) else {
        print("warning: icon \(name) not found"); return nil
    }
    return img
}
for (i, size) in spec.sizes.enumerated() {
    let (w, h) = (size[0], size[1])
    let folder = spec.folders.flatMap { i < $0.count ? $0[i] : nil } ?? "\(w)x\(h)"
    let dir = base.appendingPathComponent(spec.out).appendingPathComponent(folder)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for slide in spec.slides {
        let png = try render(slide, spec: spec, base: base, brand: brand, icons: icons, w: w, h: h)
        try png.write(to: dir.appendingPathComponent(slide.file))
        print("wrote \(dir.lastPathComponent)/\(slide.file)")
    }
}
