#if os(iOS)
import Foundation
import UIKit
import CoreImage

public enum EffectPainter {
    /// 安全の上限。ここを超える大きさ・濃さは、カタログに何が書いてあっても出さない。
    /// 画面の 1/8 より大きい印は、子どもの姿より かざりのほうが目立ってしまう。
    private static let maxRadius = 0.12, maxLineWidth = 0.02, maxAlpha = 1.0

    /// CGContext must have a top-left origin (UIKit already does).
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
            let alpha = CGFloat(fxClamp(c.alpha,0,maxAlpha))
            let colour = CGColor(red: CGFloat(fxClamp(c.red)),green: CGFloat(fxClamp(c.green)),
                                 blue: CGFloat(fxClamp(c.blue)),alpha: alpha)
            context.setStrokeColor(colour)
            context.setLineWidth(CGFloat(max(0.65,min(maxLineWidth,primitive.lineWidth)*short)))
            switch primitive.kind {
            case .ring:
                let p = mapper.map(primitive.points[0]); let r = min(maxRadius,primitive.radius)*short
                context.strokeEllipse(in: CGRect(x: p.x-r,y: p.y-r,width: r*2,height: r*2))
            case .stroke:
                context.beginPath()
                for (index,point) in primitive.points.enumerated() {
                    let p = mapper.map(point)
                    if index == 0 { context.move(to: CGPoint(x: p.x,y: p.y)) }
                    else { context.addLine(to: CGPoint(x: p.x,y: p.y)) }
                }
                context.strokePath()
            case .orb:
                // 気のたま: こぶし（手首・足首）そのものを光らせる。まん中が白く、
                // ふちに向かって色になって消える。細い輪とちがって、遠目でも
                // 「手が光っている」と一目で分かる。
                let p = mapper.map(primitive.points[0]); let r = min(maxRadius,primitive.radius)*short
                guard r > 0.5 else { continue }
                let core = CGColor(red: 1,green: 1,blue: 1,alpha: alpha)
                let edge = CGColor(red: CGFloat(fxClamp(c.red)),green: CGFloat(fxClamp(c.green)),
                                   blue: CGFloat(fxClamp(c.blue)),alpha: 0)
                guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                      let gradient = CGGradient(colorsSpace: space,colors: [core,colour,edge] as CFArray,
                                                locations: [0,0.42,1]) else { continue }
                context.saveGState()
                context.drawRadialGradient(gradient,startCenter: CGPoint(x: p.x,y: p.y),startRadius: 0,
                                           endCenter: CGPoint(x: p.x,y: p.y),endRadius: r,options: [])
                context.restoreGState()
            case .glyph:
                guard let id = primitive.glyphID, let glyph = catalog.glyph(id) else { continue }
                let center = mapper.map(primitive.points[0]); let size = min(maxRadius,primitive.radius)*short
                let angle = primitive.angle; let cs = cos(angle), sn = sin(angle)
                func addPath() {
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
                }
                // 白いふちを先に敷いてから塗る。道着でも壁でも畳でも、同じように
                // 形が抜けて見える（線だけだと背景に溶けて、何の絵か分からない）。
                addPath()
                context.setStrokeColor(CGColor(red: 1,green: 1,blue: 1,alpha: alpha*0.95))
                context.setLineWidth(size*(glyph.isFilled ? 0.23 : 0.34))
                context.strokePath()
                addPath()
                if glyph.isFilled {
                    context.setFillColor(colour)
                    context.fillPath()
                } else {
                    context.setStrokeColor(colour)
                    context.setLineWidth(size*0.15)
                    context.strokePath()
                }
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
    /// 塗りの印は輪郭がはっきりしているので、768 で描いて 1920 に伸ばすと
    /// ふちがぼやける。1280 で描く（絵のあるコマだけ・1枚を使い回し）。
    func image(for scene: EffectScene, maximumEdge: Int = 1280) throws -> CIImage? {
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
