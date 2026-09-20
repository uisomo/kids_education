import AppKit
import ImageIO
import UniformTypeIdentifiers

/// The 14 音符 of アランのピアノ, cut out of one sheet of artwork.
///
/// The sheet is 3 notes wide and 5 tall on white, in level order (しろ, きいろ,
/// … ドラゴン, でんせつ) with the last row holding only two. Each note is
/// lifted off the white by a flood fill seeded from the image border, so the
/// white highlights INSIDE a note (and the whole しろの音符) survive — a plain
/// "white is transparent" pass would eat them.
///
/// The notes are NOT on an even grid: cutting the sheet into 5 equal bands put
/// the bottom of one row into the top of the next. So the rows and columns are
/// found from the ink itself — a band is a run of lines that have any pixel in
/// them, split wherever the sheet goes blank.
///
/// Run from the repo root:  swift karate-trainer/tools/make-piano-notes.swift

let SRC = "karate-trainer/tools/art-src-piano/notes.webp"
let OUT_DIR = "karate-trainer/public-piano/images/notes"
let SIDE = 256          // exported square; the card draws it at 46pt (138px @3x)
let GAP = 8             // blank lines that separate one note from the next
let BG_MIN = 236        // a pixel this bright on every channel counts as paper
let EDGE_MIN = 200      // anti-aliased ring next to the paper fades out instead

guard let srcRef = CGImageSourceCreateWithURL(URL(fileURLWithPath: SRC) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(srcRef, 0, nil) else { fatalError("cannot read \(SRC)") }
let W = img.width, H = img.height

// Read the sheet into straight RGBA.
var px = [UInt8](repeating: 0, count: W * H * 4)
px.withUnsafeMutableBytes { buf in
    guard let ctx = CGContext(data: buf.baseAddress, width: W, height: H, bitsPerComponent: 8,
                              bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { fatalError("no read ctx") }
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
}
@inline(__always) func minChannel(_ i: Int) -> Int {
    min(Int(px[i]), min(Int(px[i + 1]), Int(px[i + 2])))
}

// Flood fill the paper from the border. Anything bright the fill cannot reach
// (a highlight inside a note) stays opaque.
var paper = [Bool](repeating: false, count: W * H)
var stack: [Int] = []
for x in 0..<W { for y in [0, H - 1] where minChannel((y * W + x) * 4) >= BG_MIN {
    let p = y * W + x; if !paper[p] { paper[p] = true; stack.append(p) } } }
for y in 0..<H { for x in [0, W - 1] where minChannel((y * W + x) * 4) >= BG_MIN {
    let p = y * W + x; if !paper[p] { paper[p] = true; stack.append(p) } } }
while let p = stack.popLast() {
    let x = p % W, y = p / W
    for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let nx = x + dx, ny = y + dy
        guard nx >= 0, nx < W, ny >= 0, ny < H else { continue }
        let q = ny * W + nx
        if !paper[q] && minChannel(q * 4) >= BG_MIN { paper[q] = true; stack.append(q) }
    }
}

// Paper goes fully transparent; the near-white ring touching it fades, so the
// cut-out keeps its anti-aliased edge instead of a hard white fringe.
for p in 0..<(W * H) {
    let i = p * 4
    if paper[p] { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0; continue }
    let m = minChannel(i)
    guard m > EDGE_MIN else { continue }
    let x = p % W, y = p / W
    var touchesPaper = false
    for dy in -1...1 { for dx in -1...1 {
        let nx = x + dx, ny = y + dy
        if nx >= 0, nx < W, ny >= 0, ny < H, paper[ny * W + nx] { touchesPaper = true }
    } }
    if touchesPaper {
        let a = Double(255 - m) / Double(255 - EDGE_MIN)
        px[i + 3] = UInt8(max(0, min(255, a * 255)))
    }
}

// Runs of consecutive indices that carry ink, ignoring gaps thinner than GAP.
func runs(_ hasInk: [Bool]) -> [(lo: Int, hi: Int)] {
    var out: [(Int, Int)] = []
    var start: Int? = nil, blank = 0
    for (i, ink) in hasInk.enumerated() {
        if ink {
            if start == nil { start = i - min(blank, 0) }
            blank = 0
        } else if start != nil {
            blank += 1
            if blank >= GAP { out.append((start!, i - blank)); start = nil; blank = 0 }
        }
    }
    if let s = start { out.append((s, hasInk.count - 1)) }
    return out
}
@inline(__always) func hasInk(_ x: Int, _ y: Int) -> Bool { px[(y * W + x) * 4 + 3] > 8 }

// Bands of lines with ink = the note rows; inside a band, the same by column.
let bands = runs((0..<H).map { y in (0..<W).contains { hasInk($0, y) } })
var boxes: [(x: Int, y: Int, w: Int, h: Int)] = []
for band in bands {
    for col in runs((0..<W).map { x in (band.lo...band.hi).contains { hasInk(x, $0) } }) {
        var minY = band.hi, maxY = band.lo
        for y in band.lo...band.hi where (col.lo...col.hi).contains(where: { hasInk($0, y) }) {
            minY = min(minY, y); maxY = max(maxY, y)
        }
        boxes.append((col.lo, minY, col.hi - col.lo + 1, maxY - minY + 1))
    }
}
print("rows: \(bands.count), notes: \(boxes.count)")

guard let sheet = px.withUnsafeMutableBytes({ buf -> CGImage? in
    guard let ctx = CGContext(data: buf.baseAddress, width: W, height: H, bitsPerComponent: 8,
                              bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    return ctx.makeImage()
}) else { fatalError("no sheet image") }

func write(_ image: CGImage, _ path: String) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                     UTType.png.identifier as CFString, 1, nil)
        else { fatalError("no dest \(path)") }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("write failed \(path)") }
}

try? FileManager.default.createDirectory(atPath: OUT_DIR, withIntermediateDirectories: true)
for (i, box) in boxes.enumerated() {
    guard let tile = sheet.cropping(to: CGRect(x: box.x, y: box.y, width: box.w, height: box.h))
        else { fatalError("cannot crop note \(i + 1)") }
    guard let ctx = CGContext(data: nil, width: SIDE, height: SIDE, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fatalError("no ctx") }
    ctx.interpolationQuality = .high
    // contain, centred: every note keeps its own proportions, and the 14 files
    // share one square box so the card never has to know which level it draws.
    let k = min(CGFloat(SIDE) / CGFloat(box.w), CGFloat(SIDE) / CGFloat(box.h))
    let w = CGFloat(box.w) * k, h = CGFloat(box.h) * k
    ctx.draw(tile, in: CGRect(x: (CGFloat(SIDE) - w) / 2, y: (CGFloat(SIDE) - h) / 2, width: w, height: h))
    guard let made = ctx.makeImage() else { fatalError("no image") }
    let path = String(format: "%@/note-%02d.png", OUT_DIR, i + 1)
    write(made, path)
    print(String(format: "wrote %@  (sheet %dx%d at %d,%d)", path, box.w, box.h, box.x, box.y))
}
