import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Square, opaque, exact size. Transparent source pixels land on white — the
/// karate icon and trophy are white-backed too, and an iOS app icon may not
/// carry an alpha channel at all. noneSkipLast gives a context CoreGraphics
/// actually supports; a 24-bit rep does not, and silently yields black.
func square(_ src: String, _ side: Int, _ out: String, jpeg: Bool = false) {
    guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: src) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(s, 0, nil) else { fatalError("cannot read \(src)") }
    guard let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("no ctx") }
    ctx.interpolationQuality = .high
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
    // contain, centred — the art is square already, so this is just a resize
    let k = min(CGFloat(side) / CGFloat(img.width), CGFloat(side) / CGFloat(img.height))
    let w = CGFloat(img.width) * k, h = CGFloat(img.height) * k
    ctx.draw(img, in: CGRect(x: (CGFloat(side) - w)/2, y: (CGFloat(side) - h)/2, width: w, height: h))
    guard let made = ctx.makeImage() else { fatalError("no image") }
    let type = (jpeg ? UTType.jpeg : UTType.png).identifier as CFString
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, type, 1, nil)
        else { fatalError("no dest") }
    CGImageDestinationAddImage(dest, made, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { fatalError("write failed") }
    print("wrote \(out) \(side)x\(side)")
}

let icon = "karate-trainer/tools/art-src-piano/icon.webp"
square(icon, 1024, "ios/App/App/Assets.xcassets/AppIcon-Piano.appiconset/AppIcon-512@2x.png")
square(icon, 512, "karate-trainer/public-piano/icons/icon-512.png")
square(icon, 180, "karate-trainer/public-piano/icons/icon-180.png")
square(icon, 32,  "karate-trainer/public-piano/icons/favicon-32.png")
// The trophy art is only 250x250; 512 covers the 140pt hero at @3x without
// pretending to more detail than the source has.
square("karate-trainer/tools/art-src-piano/trophy.png", 512,
       "karate-trainer/public-piano/badges/victory_trophy.jpg", jpeg: true)
