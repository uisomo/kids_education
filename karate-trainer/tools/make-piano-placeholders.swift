// Placeholder art for アランのピアノ, drawn from emoji so the piano app runs
// before the real pictures exist. Every file lands in public-piano/ under the
// SAME path as the karate picture it replaces (vite.config.ts lays that folder
// over public/), plus the iOS icon in AppIcon-Piano.appiconset.
//
//   swift karate-trainer/tools/make-piano-placeholders.swift            (from the repo root)
//
// Replacing one later: drop the real file at the same path in public-piano/.
// Re-running this script overwrites ONLY files it made (see isPlaceholder):
// anything else found at a path — i.e. real art — is left alone.

import AppKit
import CoreText
import Foundation

let repo = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let pub = repo.appendingPathComponent("karate-trainer/public")
let out = repo.appendingPathComponent("karate-trainer/public-piano")
let iconSet = repo.appendingPathComponent("ios/App/App/Assets.xcassets/AppIcon-Piano.appiconset")
let appName = "アランのピアノ"

// Placeholders are listed here once written, so a later run can tell them from real art.
let manifestURL = out.appendingPathComponent(".placeholders")
var made = Set((try? String(contentsOf: manifestURL, encoding: .utf8))?.split(separator: "\n").map(String.init) ?? [])
func isPlaceholder(_ rel: String) -> Bool {
    !FileManager.default.fileExists(atPath: out.appendingPathComponent(rel).path) || made.contains(rel)
}

for f in ["MPLUSRounded1c-ExtraBold.ttf"] {
    CTFontManagerRegisterFontsForURL(pub.appendingPathComponent("fonts/\(f)") as CFURL, .process, nil)
}
let titleFont = NSFont(name: "RoundedMplus1c-ExtraBold", size: 10) ?? NSFont.boldSystemFont(ofSize: 10)

// MARK: drawing helpers

func color(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: a)
}

/// Draws into a w×h bitmap (origin top-left, like the web) and returns it.
func canvas(_ w: Int, _ h: Int, opaque: Bool, _ draw: (CGContext) -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let g = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = g
    let cg = g.cgContext
    cg.translateBy(x: 0, y: CGFloat(h)); cg.scaleBy(x: 1, y: -1)
    if !opaque { cg.clear(CGRect(x: 0, y: 0, width: w, height: h)) }
    draw(cg)
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

func gradient(_ cg: CGContext, _ rect: CGRect, _ colors: [NSColor], vertical: Bool = true) {
    let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors.map(\.cgColor) as CFArray, locations: nil)!
    cg.saveGState(); cg.clip(to: rect)
    cg.drawLinearGradient(grad, start: CGPoint(x: rect.minX, y: rect.minY),
                          end: vertical ? CGPoint(x: rect.minX, y: rect.maxY) : CGPoint(x: rect.maxX, y: rect.minY), options: [])
    cg.restoreGState()
}

/// Text centred on `center`. The context is flipped, so NSString drawing needs a flipped NSGraphicsContext.
func text(_ s: String, _ center: CGPoint, size: CGFloat, font: NSFont? = nil, color c: NSColor = .white,
          stroke: NSColor? = nil, maxWidth: CGFloat = .greatestFiniteMagnitude) {
    var f = (font ?? NSFont(name: "Apple Color Emoji", size: size)!).withSize(size)
    var attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: c]
    var str = NSAttributedString(string: s, attributes: attrs)
    if str.size().width > maxWidth {
        f = f.withSize(size * maxWidth / str.size().width)
        attrs[.font] = f
        str = NSAttributedString(string: s, attributes: attrs)
    }
    let sz = str.size()
    let flipped = NSGraphicsContext(cgContext: NSGraphicsContext.current!.cgContext, flipped: true)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = flipped
    let origin = CGPoint(x: center.x - sz.width / 2, y: center.y - sz.height / 2)
    if let stroke {
        var sa = attrs; sa[.strokeColor] = stroke; sa[.strokeWidth] = 14
        NSAttributedString(string: s, attributes: sa).draw(at: origin)
    }
    str.draw(at: origin)
    NSGraphicsContext.restoreGraphicsState()
}

func title(_ center: CGPoint, size: CGFloat, maxWidth: CGFloat) {
    text(appName, center, size: size, font: titleFont, color: color(0xffffff), stroke: color(0x5b21b6), maxWidth: maxWidth)
}

/// A strip of piano keys across `rect`.
func keyboard(_ cg: CGContext, _ rect: CGRect, whiteKeys: Int) {
    let kw = rect.width / CGFloat(whiteKeys)
    cg.setFillColor(color(0xffffff).cgColor); cg.fill(rect)
    cg.setStrokeColor(color(0x1f1b2e).cgColor); cg.setLineWidth(max(2, kw * 0.06))
    for i in 0...whiteKeys { let x = rect.minX + CGFloat(i) * kw; cg.strokeLineSegments(between: [CGPoint(x: x, y: rect.minY), CGPoint(x: x, y: rect.maxY)]) }
    cg.setFillColor(color(0x1f1b2e).cgColor)
    for i in 0..<whiteKeys where [0, 1, 3, 4, 5].contains(i % 7) {
        cg.fill(CGRect(x: rect.minX + (CGFloat(i) + 0.68) * kw, y: rect.minY, width: kw * 0.64, height: rect.height * 0.6))
    }
}

/// Faint notes scattered over a backdrop (fixed seed, so reruns match).
func sprinkle(_ w: CGFloat, _ h: CGFloat, count: Int, size: CGFloat, alpha: CGFloat) {
    var seed: UInt64 = 42
    func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat(seed >> 33) / CGFloat(1 << 31) }
    let marks = ["🎵", "🎶", "⭐️", "🎹", "✨"]
    for i in 0..<count {
        let cg = NSGraphicsContext.current!.cgContext
        cg.saveGState(); cg.setAlpha(alpha)
        text(marks[i % marks.count], CGPoint(x: rnd() * w, y: rnd() * h), size: size * (0.7 + rnd() * 0.6))
        cg.restoreGState()
    }
}

func save(_ rep: NSBitmapImageRep, _ rel: String, to base: URL = out, track: Bool = true) {
    if track && !isPlaceholder(rel) { print("keep  \(rel) (real art)"); return }
    let url = base.appendingPathComponent(rel)
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let jpg = rel.hasSuffix(".jpg")
    try! rep.representation(using: jpg ? .jpeg : .png, properties: jpg ? [.compressionFactor: 0.85] : [:])!.write(to: url)
    if track { made.insert(rel) }
    print("wrote \(rel)")
}

// MARK: characters — same ids, names and colours as character-store.ts

struct Character { let id: String; let face: String; let top: UInt32; let bottom: UInt32 }
let characters = [
    Character(id: "alan", face: "🦊", top: 0xFF6B4A, bottom: 0xC8402F),
    Character(id: "leo", face: "🐱", top: 0x60A5FA, bottom: 0x1D4ED8),
    Character(id: "izzy", face: "🐱", top: 0xFDE047, bottom: 0xCA8A04),
]

func avatar(_ c: Character, cheer: Bool) -> NSBitmapImageRep {
    canvas(1024, 1024, opaque: true) { cg in
        gradient(cg, CGRect(x: 0, y: 0, width: 1024, height: 1024), [color(c.top), color(c.bottom)])
        if cheer { sprinkle(1024, 1024, count: 14, size: 110, alpha: 0.55) }
        text(c.face, CGPoint(x: 512, y: 470), size: 560)
        text(cheer ? "🎶" : "🎹", CGPoint(x: 760, y: 790), size: 260)
    }
}

for c in characters {
    save(avatar(c, cheer: false), "characters/\(c.id).jpg")
    save(avatar(c, cheer: true), "characters/\(c.id)_cheer.jpg")
}

// MARK: backdrops

let pastel = [color(0xfde2f3), color(0xe0e7ff), color(0xcffafe)]
// 特訓 tab (setup screen) meadow → a pastel music room.
save(canvas(1536, 2752, opaque: true) { cg in
    gradient(cg, CGRect(x: 0, y: 0, width: 1536, height: 2752), pastel)
    sprinkle(1536, 2752, count: 40, size: 150, alpha: 0.35)
    keyboard(cg, CGRect(x: 0, y: 2352, width: 1536, height: 400), whiteKeys: 14)
}, "characters/play.jpg")

// Behind the camera during practice → a stage.
save(canvas(1536, 2752, opaque: true) { cg in
    gradient(cg, CGRect(x: 0, y: 0, width: 1536, height: 2752), [color(0x3b0764), color(0x1e1b4b)])
    sprinkle(1536, 2752, count: 30, size: 140, alpha: 0.25)
    keyboard(cg, CGRect(x: 0, y: 2352, width: 1536, height: 400), whiteKeys: 14)
}, "characters/Dojo.jpg")

// Loading screen.
save(canvas(1152, 1728, opaque: true) { cg in
    gradient(cg, CGRect(x: 0, y: 0, width: 1152, height: 1728), [color(0xa78bfa), color(0xf472b6)])
    sprinkle(1152, 1728, count: 22, size: 120, alpha: 0.4)
    text("🦊", CGPoint(x: 576, y: 760), size: 420)
    text("🎹", CGPoint(x: 576, y: 1120), size: 300)
    title(CGPoint(x: 576, y: 420), size: 150, maxWidth: 1000)
}, "characters/Front.jpg")

// Dark page background behind every other screen.
save(canvas(768, 1376, opaque: true) { cg in
    gradient(cg, CGRect(x: 0, y: 0, width: 768, height: 1376), [color(0x4c1d95), color(0x1e1b4b)])
    sprinkle(768, 1376, count: 26, size: 80, alpha: 0.5)
}, "vertical_toybox_bg.jpg")

// Done-screen trophy.
save(canvas(1024, 1024, opaque: true) { cg in
    gradient(cg, CGRect(x: 0, y: 0, width: 1024, height: 1024), [color(0xfef3c7), color(0xfbbf24)])
    sprinkle(1024, 1024, count: 12, size: 110, alpha: 0.5)
    text("🏆", CGPoint(x: 512, y: 470), size: 560)
    text("🎹", CGPoint(x: 780, y: 800), size: 240)
}, "badges/victory_trophy.jpg")

// MARK: どうがのかざり (burned into the saved video; transparent)

// わく: a rainbow border with the title on top, piano keys along the bottom.
save(canvas(1080, 1920, opaque: false) { cg in
    let inset: CGFloat = 26, line: CGFloat = 30
    let path = CGPath(roundedRect: CGRect(x: inset, y: 250, width: 1080 - inset * 2, height: 1920 - 250 - inset),
                      cornerWidth: 60, cornerHeight: 60, transform: nil)
    cg.saveGState()
    cg.addPath(path); cg.setLineWidth(line); cg.replacePathWithStrokedPath(); cg.clip()
    gradient(cg, CGRect(x: 0, y: 0, width: 1080, height: 1920),
             [color(0xf472b6), color(0xa78bfa), color(0x60a5fa), color(0x34d399), color(0xfacc15)])
    cg.restoreGState()
    keyboard(cg, CGRect(x: 120, y: 1780, width: 840, height: 110), whiteKeys: 14)
    text("🦊", CGPoint(x: 150, y: 150), size: 190)
    title(CGPoint(x: 555, y: 140), size: 150, maxWidth: 580)
    text("🎹", CGPoint(x: 960, y: 150), size: 150)
    for (e, p) in [("🎵", CGPoint(x: 50, y: 700)), ("🎶", CGPoint(x: 1030, y: 900)), ("⭐️", CGPoint(x: 1030, y: 400)), ("🎵", CGPoint(x: 50, y: 1400))] {
        text(e, p, size: 80)
    }
}, "images/decor-frame.png")

// アラン: the corner badge.
save(canvas(460, 460, opaque: false) { cg in
    cg.setFillColor(color(0xffffff).cgColor); cg.fillEllipse(in: CGRect(x: 20, y: 20, width: 420, height: 420))
    cg.setStrokeColor(color(0xa78bfa).cgColor); cg.setLineWidth(18); cg.strokeEllipse(in: CGRect(x: 29, y: 29, width: 402, height: 402))
    text("🦊", CGPoint(x: 220, y: 215), size: 230)
    text("🎹", CGPoint(x: 330, y: 340), size: 120)
}, "images/decor-icon.png")

// バナー: the bottom strip.
save(canvas(1080, 405, opaque: false) { cg in
    let box = CGPath(roundedRect: CGRect(x: 20, y: 40, width: 1040, height: 330), cornerWidth: 60, cornerHeight: 60, transform: nil)
    cg.addPath(box); cg.setFillColor(color(0xffffff, 0.95).cgColor); cg.fillPath()
    title(CGPoint(x: 420, y: 205), size: 130, maxWidth: 660)
    text("🦊", CGPoint(x: 850, y: 190), size: 200)
    text("🎹", CGPoint(x: 960, y: 290), size: 110)
}, "images/decor-banner.png")

// MARK: icons

func appIcon(_ size: Int) -> NSBitmapImageRep {
    canvas(size, size, opaque: true) { cg in
        let s = CGFloat(size)
        gradient(cg, CGRect(x: 0, y: 0, width: s, height: s), [color(0xa78bfa), color(0xec4899)])
        keyboard(cg, CGRect(x: 0, y: s * 0.68, width: s, height: s * 0.32), whiteKeys: 7)
        text("🦊", CGPoint(x: s * 0.5, y: s * 0.36), size: s * 0.5)
        text("🎵", CGPoint(x: s * 0.82, y: s * 0.16), size: s * 0.18)
    }
}
save(appIcon(32), "icons/favicon-32.png")
save(appIcon(180), "icons/icon-180.png")
save(appIcon(512), "icons/icon-512.png")
if !FileManager.default.fileExists(atPath: iconSet.appendingPathComponent("AppIcon-512@2x.png").path)
    || made.contains("ios:AppIcon-Piano") {
    save(appIcon(1024), "AppIcon-512@2x.png", to: iconSet, track: false)
    made.insert("ios:AppIcon-Piano")
    try! """
    {
      "images" : [
        {
          "filename" : "AppIcon-512@2x.png",
          "idiom" : "universal",
          "platform" : "ios",
          "size" : "1024x1024"
        }
      ],
      "info" : {
        "author" : "xcode",
        "version" : 1
      }
    }

    """.write(to: iconSet.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
}

// Cheer animations are NOT replaced: the piano app uses the karate ones as they are.

made = made.filter { !$0.hasPrefix("characters/cheer/") }
try! (made.sorted().joined(separator: "\n") + "\n").write(to: manifestURL, atomically: true, encoding: .utf8)
print("done — \(made.count) placeholders")
