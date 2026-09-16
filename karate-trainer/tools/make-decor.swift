// Turns the raw 「アランのからて」 artwork into overlay-ready PNGs with alpha.
//
//   swift tools/make-decor.swift <in.png> frame|white <out.png> <width> <height>
//
// frame: the green screen in the middle is keyed out, then the white paper
//        around the sticker is flood-filled from the edges.
// white: only the flood fill — for art that sits on a white canvas.
//
// A flood fill rather than "every white pixel": Alan's gi is white too, and it
// must survive. Only white that the border can reach is background.

import AppKit
import CoreGraphics

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 6, let outW = Int(args[4]), let outH = Int(args[5]) else {
    fail("usage: make-decor.swift <in.png> frame|white <out.png> <width> <height>")
}
let (inPath, mode, outPath) = (args[1], args[2], args[3])

guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: inPath) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("cannot read \(inPath)") }

let w = image.width, h = image.height
var pixels = [UInt8](repeating: 0, count: w * h * 4)
guard let ctx = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8,
                          bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no context") }
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

@inline(__always) func idx(_ x: Int, _ y: Int) -> Int { (y * w + x) * 4 }

// --- green screen ------------------------------------------------------------
// Only the one big green rectangle in the middle, found by flooding out from
// the centre. Keying "every green pixel" also erases the green letters in
// 「アランのからて」 — that is exactly what happened the first time round.
if mode == "frame" {
    @inline(__always) func greenness(_ i: Int) -> Int {
        Int(pixels[i + 1]) - max(Int(pixels[i]), Int(pixels[i + 2]))
    }
    @inline(__always) func isScreen(_ i: Int) -> Bool {
        Int(pixels[i + 1]) > 110 && greenness(i) > 55
    }

    var keyed = [Bool](repeating: false, count: w * h)
    var green: [Int] = []
    // Several seeds, so a frame whose exact centre lands on something else
    // still finds the screen.
    for fx in [0.5, 0.35, 0.65] {
        for fy in [0.5, 0.4, 0.6] {
            let x = Int(Double(w) * fx), y = Int(Double(h) * fy)
            let p = y * w + x
            if !keyed[p], isScreen(idx(x, y)) { keyed[p] = true; green.append(p) }
        }
    }

    var head = 0
    while head < green.count {
        let p = green[head]; head += 1
        let x = p % w, y = p / w
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = x + dx, ny = y + dy
            guard nx >= 0, nx < w, ny >= 0, ny < h, !keyed[ny * w + nx], isScreen(idx(nx, ny)) else { continue }
            keyed[ny * w + nx] = true
            green.append(ny * w + nx)
        }
    }

    // The screen itself goes; the ring around it keeps a little alpha and has
    // the green spill pulled back out of it.
    var edge: [(Int, Double)] = []
    for p in green {
        let x = p % w, y = p / w
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = x + dx, ny = y + dy
            guard nx >= 0, nx < w, ny >= 0, ny < h, !keyed[ny * w + nx] else { continue }
            let i = idx(nx, ny)
            let g = greenness(i)
            guard g > 22 else { continue }
            let t = min(1, max(0, Double(g - 22) / Double(55 - 22)))
            edge.append((i, 1 - t))
        }
    }
    for p in green {
        let i = idx(p % w, p / w)
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0
    }
    for (i, alpha) in edge {
        let rival = max(Int(pixels[i]), Int(pixels[i + 2]))
        pixels[i] = UInt8(Double(pixels[i]) * alpha)
        pixels[i + 1] = UInt8(Double(min(255, rival)) * alpha)
        pixels[i + 2] = UInt8(Double(pixels[i + 2]) * alpha)
        pixels[i + 3] = UInt8(255 * alpha)
    }
}

// --- white paper, flood-filled from the border ------------------------------
// Near-pure white only: Alan's gi is white as well, and it is separated from
// the paper by nothing more than a soft grey line — a looser threshold leaks
// through that line and eats holes out of the uniform.
let hard = 251, soft = 235
var visited = [Bool](repeating: false, count: w * h)
var queue: [Int] = []
queue.reserveCapacity(w * h / 4)

@inline(__always) func isPaper(_ x: Int, _ y: Int) -> Bool {
    let i = idx(x, y)
    if pixels[i + 3] == 0 { return true }
    return min(Int(pixels[i]), min(Int(pixels[i + 1]), Int(pixels[i + 2]))) >= hard
}

for x in 0..<w { for y in [0, h - 1] where isPaper(x, y) && !visited[y * w + x] {
    visited[y * w + x] = true; queue.append(y * w + x)
} }
for y in 0..<h { for x in [0, w - 1] where isPaper(x, y) && !visited[y * w + x] {
    visited[y * w + x] = true; queue.append(y * w + x)
} }

var head = 0
while head < queue.count {
    let p = queue[head]; head += 1
    let x = p % w, y = p / w
    let i = idx(x, y)
    pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0
    for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let nx = x + dx, ny = y + dy
        guard nx >= 0, nx < w, ny >= 0, ny < h, !visited[ny * w + nx], isPaper(nx, ny) else { continue }
        visited[ny * w + nx] = true
        queue.append(ny * w + nx)
    }
}

// One feathered ring: pixels touching the cut-out that are nearly as pale keep
// a little alpha, so the sticker keeps a soft edge instead of a jagged one.
var feather: [(Int, Double)] = []
for y in 0..<h {
    for x in 0..<w where pixels[idx(x, y) + 3] != 0 {
        let i = idx(x, y)
        let lum = min(Int(pixels[i]), min(Int(pixels[i + 1]), Int(pixels[i + 2])))
        guard lum >= soft else { continue }
        let touches = [(1, 0), (-1, 0), (0, 1), (0, -1)].contains { dx, dy in
            let nx = x + dx, ny = y + dy
            return nx >= 0 && nx < w && ny >= 0 && ny < h && pixels[idx(nx, ny) + 3] == 0
        }
        if touches {
            // lum can sit above the hard threshold (an interior white the fill
            // never reached), so the ratio is clamped rather than trusted.
            let alpha = min(1, max(0, Double(hard - lum) / Double(hard - soft)))
            feather.append((i, alpha))
        }
    }
}
for (i, alpha) in feather {
    for c in 0..<3 { pixels[i + c] = UInt8(Double(pixels[i + c]) * alpha) }
    pixels[i + 3] = UInt8(255 * alpha)
}

guard let keyed = ctx.makeImage() else { fail("no keyed image") }

// --- scale to the size the overlay wants ------------------------------------
guard let outCtx = CGContext(data: nil, width: outW, height: outH, bitsPerComponent: 8,
                             bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no out context") }
outCtx.interpolationQuality = .high
outCtx.draw(keyed, in: CGRect(x: 0, y: 0, width: outW, height: outH))
guard let scaled = outCtx.makeImage() else { fail("no scaled image") }

let url = URL(fileURLWithPath: outPath) as CFURL
guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else { fail("no destination") }
CGImageDestinationAddImage(dest, scaled, nil)
guard CGImageDestinationFinalize(dest) else { fail("write failed") }
print("\(outPath)  \(outW)x\(outH)")
