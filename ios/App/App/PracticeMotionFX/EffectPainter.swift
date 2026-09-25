#if os(iOS)
import Foundation
import UIKit
import CoreImage

public enum EffectPainter {
    /// CGContext must have a top-left origin (UIKit already does). Colors are unfilled outline accents.
    public static func draw(_ scene: EffectScene, in context: CGContext, viewport: CGSize,
                            catalog: EffectCatalog, mode: FXContentMode = .fit, mirrored: Bool = false) {
        guard viewport.width > 0, viewport.height > 0 else { return }
        let mapper = VideoCoordinateMapper(source: scene.sourceSize,
            viewport: FXSize(Double(viewport.width),Double(viewport.height)),mode: mode,mirrored: mirrored)
        let video = mapper.videoRect
        let short = min(video.width,video.height)
        guard short > 0 else { return }
        context.saveGState(); defer { context.restoreGState() }
        context.clip(to: CGRect(x: 0,y: 0,width: viewport.width,height: viewport.height))
        context.clip(to: CGRect(x: video.x,y: video.y,width: video.width,height: video.height))
        context.setLineCap(.round); context.setLineJoin(.round)
        for primitive in scene.primitives.prefix(8) {
            guard !primitive.points.isEmpty, primitive.points.allSatisfy(\.isFinite),
                  primitive.color.alpha > 0 else { continue }
            let c = primitive.color
            context.setStrokeColor(CGColor(red: CGFloat(fxClamp(c.red)),green: CGFloat(fxClamp(c.green)),
                                           blue: CGFloat(fxClamp(c.blue)),alpha: CGFloat(fxClamp(c.alpha,0,0.70))))
            context.setLineWidth(CGFloat(max(0.65,min(0.006,primitive.lineWidth)*short)))
            switch primitive.kind {
            case .ring:
                let p = mapper.map(primitive.points[0]); let r = min(0.055,primitive.radius)*short
                context.strokeEllipse(in: CGRect(x: p.x-r,y: p.y-r,width: r*2,height: r*2))
            case .stroke:
                context.beginPath()
                for (index,point) in primitive.points.enumerated() {
                    let p = mapper.map(point)
                    if index == 0 { context.move(to: CGPoint(x: p.x,y: p.y)) }
                    else { context.addLine(to: CGPoint(x: p.x,y: p.y)) }
                }
                context.strokePath()
            case .glyph:
                guard let id = primitive.glyphID, let glyph = catalog.glyph(id) else { continue }
                let center = mapper.map(primitive.points[0]); let size = min(0.055,primitive.radius)*short
                let angle = primitive.angle; let cs = cos(angle), sn = sin(angle)
                context.beginPath()
                for path in glyph.paths {
                    for (index,point) in path.enumerated() {
                        let x = (point.x*cs-point.y*sn)*size*(mirrored ? -1 : 1)
                        let y = (point.x*sn+point.y*cs)*size
                        let p = CGPoint(x: center.x+x,y: center.y+y)
                        if index == 0 { context.move(to: p) } else { context.addLine(to: p) }
                    }
                    if glyph.closed { context.closePath() }
                }
                context.strokePath()
            }
        }
    }
}

/// Thread-safe reusable small overlay raster. Video frames themselves stay in Core Image / AVFoundation.
final class OverlayRasterizer: @unchecked Sendable {
    private let lock = NSLock()
    private var context: CGContext?
    private var dimensions = CGSize.zero
    private let catalog: EffectCatalog
    init(catalog: EffectCatalog) { self.catalog = catalog }
    func image(for scene: EffectScene, maximumEdge: Int = 768) throws -> CIImage? {
        guard !scene.primitives.isEmpty, scene.sourceSize.isValid else { return nil }
        lock.lock(); defer { lock.unlock() }
        let scale = min(1,Double(maximumEdge)/max(scene.sourceSize.width,scene.sourceSize.height))
        let w = max(2,Int((scene.sourceSize.width*scale).rounded()))
        let h = max(2,Int((scene.sourceSize.height*scale).rounded()))
        let size = CGSize(width: w,height: h)
        if context == nil || dimensions != size {
            guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
                  let made = CGContext(data: nil,width: w,height: h,bitsPerComponent: 8,bytesPerRow: 0,
                    space: colorSpace,bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw FXError.invalidData("Unable to allocate the transparent effect overlay.")
            }
            context = made; dimensions = size
        }
        guard let context else { throw FXError.invalidData("Effect overlay is unavailable.") }
        context.clear(CGRect(origin: .zero,size: size))
        context.saveGState()
        context.translateBy(x: 0,y: CGFloat(h)); context.scaleBy(x: 1,y: -1)
        EffectPainter.draw(scene,in: context,viewport: size,catalog: catalog)
        context.restoreGState()
        guard let image = context.makeImage() else { throw FXError.invalidData("Unable to render the transparent effect overlay.") }
        return CIImage(cgImage: image)
    }
}
#endif
