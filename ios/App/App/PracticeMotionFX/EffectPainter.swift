#if os(iOS)
import Foundation
import UIKit
import CoreImage

/// どの層を描くか。**光（`add`）と 空気（`over`）は 別々に描いて 別々に重ねる。**
/// 光の上には ブルーム（ぼかした複製）を足すが、空気（暗くする層）に同じことを
/// すると 部屋が明るくなってしまう。稽古中の画面（ライブ）は1枚なので `.all`。
public enum FXPaintLayer: String, Sendable { case all, air, light }

public enum EffectPainter {
    /// 安全の上限。ここを超える大きさ・太さは、カタログに何が書いてあっても出さない。
    /// 画面の 1/8 より大きい印は、子どもの姿より かざりのほうが目立ってしまう。
    private static let maxRadius = 0.12, maxLineWidth = 0.03, maxAlpha = 1.0
    /// 背景（その場所の空気）の上限。**ここは別枠**: 空気は画面ぜんたいに
    /// かかるので大きさは要るが、濃さは かざりよりずっと低く抑える。
    /// 0.22 を超えると「動画に色フィルタを掛けただけ」に見えて、子どもの顔の
    /// 色まで変わる。`halo` の 1.6 は、9:16 の四隅まで届かせるのに要る
    /// （まん中から角までが短辺の約 1.02 倍）。
    ///
    /// **2026-09-26 に 0.32 → 0.22。** 0.32 は ハーネスが CoreGraphics（sRGB）で
    /// 合成していたころの数字。アプリの書き出しは Core Image ＝ **線形の光**で
    /// 重ねるので、同じ 0.32 でも ずっと濃く沈む（炎の部屋の下半分が
    /// 茶色く濁っていた）。いまは ハーネスも書き出しと同じ道を通るので、
    /// ここで見えるとおりのものが 動画にも入る。
    private static let maxAirAlpha = 0.22, maxAirRadius = 1.6

    /// 色を 白のほうへ `amount` だけ寄せる。**純白にはしない。**
    /// 光の芯を (1,1,1) で描くと、足し算で振り切れて どの かざりも同じ白い線に
    /// なる（色が消える）。よく描けた絵は ハイライトにも色が残っている。
    private static func mixWhite(_ c: FXColor, _ amount: Double, alpha: CGFloat) -> CGColor {
        let t = fxClamp(amount)
        let r = fxClamp(c.red), g = fxClamp(c.green), b = fxClamp(c.blue)
        return CGColor(red: CGFloat(r+(1-r)*t),green: CGFloat(g+(1-g)*t),
                       blue: CGFloat(b+(1-b)*t),alpha: alpha)
    }
    /// やわらかい粒（放射グラデ）のもと。`core` は芯の広さ
    /// （0.40 = ふんわりした光、0.72 = 形の残る雪や花びら）。
    /// **ふちの立った円は「粒」に見えない** ので、粉ものは これで描く。
    /// primitive ごとに1つ作って、粒ごとに大きさだけ変える。
    private static func softDot(_ c: FXColor, alpha: CGFloat, core: Double,
                               space: CGColorSpace) -> CGGradient? {
        let k = fxClamp(core,0.05,0.85)
        let stops: [(Double, Double)] = [(0,1),(k*0.6,0.88),(k,0.60),(0.5+k*0.35,0.24),(1,0)]
        return CGGradient(colorsSpace: space,
                          colors: stops.map { mixWhite(c,0.12,alpha: alpha*CGFloat($0.1)) } as CFArray,
                          locations: stops.map { CGFloat($0.0) })
    }

    /// CGContext must have a top-left origin (UIKit already does).
    public static func draw(_ scene: EffectScene, in context: CGContext, viewport: CGSize,
                            catalog: EffectCatalog, mode: FXContentMode = .fit, mirrored: Bool = false,
                            layer: FXPaintLayer = .all) {
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
        // 24 は かざりの上限。空気（先頭の数本）はその外側なので、少し広く取る。
        for primitive in scene.primitives.prefix(32) {
            // 層で振り分ける（上限 32 は層を分ける前に数える ＝ どの層を描いても
            // 「32本目までのかざり」は同じもの）。
            guard layer == .all || (primitive.blend == .over) == (layer == .air) else { continue }
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
            case .glow:
                // ネオン管。**同じ線を何回も、太さと濃さを変えて重ねる。**
                // 外側のにじみ → 色 → 焼けた芯。1本の細い線を引くのとは別物に
                // 見える（エネルギーに見えるかどうかは ほぼこれで決まる）。
                // 重ね方は plusLighter（光を足す）。重なったところが明るくなる。
                let width = CGFloat(max(0.65,min(maxLineWidth,primitive.lineWidth)*short))
                context.saveGState()
                context.setBlendMode(.plusLighter)
                // **段差を作らないこと。** 3本（にじみ・色・芯）だと、太さの
                // 変わり目が輪っかになって見えていた。5本にして、太さ・濃さ・
                // 「白み」を 連続して変える。いちばん外のにじみは薄くていい —
                // 外側は書き出しのブルーム（`OverlayRasterizer.composite`）が作る。
                // 芯は **白 55% までの混色**。純白にすると色が消える（実写で確認）。
                let passes: [(CGFloat, CGFloat, Double)] = [
                    (2.8, 0.13, 0.00),    // 外のにじみ
                    (2.0, 0.20, 0.00),
                    (1.4, 0.30, 0.06),
                    (0.9, 0.42, 0.20),    // 色（ここが主役）
                    (0.45, 0.50, 0.55),   // 芯（白 55%）
                ]
                for (scale, strength, whiteness) in passes {
                    let a = alpha*strength
                    guard a > 0.004 else { continue }
                    context.setLineWidth(max(0.6,width*scale))
                    context.setStrokeColor(mixWhite(c,whiteness,alpha: a))
                    context.beginPath()
                    for (index,point) in primitive.points.enumerated() {
                        let p = mapper.map(point)
                        if index == 0 { context.move(to: CGPoint(x: p.x,y: p.y)) }
                        else { context.addLine(to: CGPoint(x: p.x,y: p.y)) }
                    }
                    context.strokePath()
                }
                context.restoreGState()
            case .orb:
                // 気のたま: こぶし（手首・足首）そのものを光らせる。まん中が白く、
                // ふちに向かって色になって消える。
                let p = mapper.map(primitive.points[0]); let r = min(maxRadius,primitive.radius)*short
                guard r > 0.5 else { continue }
                // まん中から外へ **なめらかに**（点光源の落ちかたに近い曲線）。
                // 3段（白・色・透明）だと ふちが輪に見えて、芯は白飛びしていた。
                // 位置・白み・濃さ を6段で落とす。芯は白 60% 混色までで色を残す。
                let stops: [(Double, Double, Double)] = [
                    (0.00, 0.60, 1.00), (0.16, 0.30, 0.94), (0.34, 0.06, 0.66),
                    (0.56, 0.00, 0.32), (0.78, 0.00, 0.11), (1.00, 0.00, 0.00),
                ]
                guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                      let gradient = CGGradient(colorsSpace: space,
                        colors: stops.map { mixWhite(c,$0.1,alpha: alpha*CGFloat($0.2)) } as CFArray,
                        locations: stops.map { CGFloat($0.0) }) else { continue }
                context.saveGState()
                context.setBlendMode(.plusLighter)
                context.drawRadialGradient(gradient,startCenter: CGPoint(x: p.x,y: p.y),startRadius: 0,
                                           endCenter: CGPoint(x: p.x,y: p.y),endRadius: r,options: [])
                context.restoreGState()
            case .ribbon:
                // 帯。**先に向かって細くなる。** 同じ太さのまま伸びる線は、炎にも
                // ドラゴンの尾にも見えない（安っぽさの正体はだいたいこれ）。
                // 中心線を左右にふくらませた多角形を塗り、上に細い白い芯を引く。
                guard primitive.points.count >= 2 else { continue }
                let w0 = CGFloat(max(0.8,min(maxLineWidth,primitive.lineWidth)*short))
                let w1 = w0*CGFloat(fxClamp(primitive.taper,0,1))
                let mapped = primitive.points.map { q -> CGPoint in
                    let m = mapper.map(q); return CGPoint(x: m.x,y: m.y)
                }
                var left: [CGPoint] = [], right: [CGPoint] = []
                for (index,p) in mapped.enumerated() {
                    let u = Double(index)/Double(max(1,mapped.count-1))
                    let half = (w0+(w1-w0)*CGFloat(u))/2
                    // 向きは前後の点から。端は隣の1点だけを見る。
                    let a = mapped[max(0,index-1)], b = mapped[min(mapped.count-1,index+1)]
                    let dx = b.x-a.x, dy = b.y-a.y
                    let len = max(1e-6,(dx*dx+dy*dy).squareRoot())
                    let nx = -dy/len*half, ny = dx/len*half
                    left.append(CGPoint(x: p.x+nx,y: p.y+ny))
                    right.append(CGPoint(x: p.x-nx,y: p.y-ny))
                    _ = u
                }
                context.saveGState()
                context.setBlendMode(.plusLighter)
                context.beginPath()
                context.move(to: left[0])
                for p in left.dropFirst() { context.addLine(to: p) }
                for p in right.reversed() { context.addLine(to: p) }
                context.closePath()
                context.setFillColor(CGColor(red: CGFloat(fxClamp(c.red)),green: CGFloat(fxClamp(c.green)),
                                             blue: CGFloat(fxClamp(c.blue)),alpha: alpha*0.80))
                context.fillPath()
                // 白く焼けた芯。細いほうの端では消す（先っぽまで白いと硬く見える）。
                // **細く・弱く。** 太いと帯ぜんたいが白くなって、何色か分からない。
                context.setLineWidth(max(0.7,w0*0.22))
                context.setStrokeColor(CGColor(red: 1,green: 1,blue: 1,alpha: alpha*0.45))
                context.beginPath()
                let coreCount = max(2,Int(Double(mapped.count)*0.62))
                context.move(to: mapped[0])
                for p in mapped.prefix(coreCount).dropFirst() { context.addLine(to: p) }
                context.strokePath()
                context.restoreGState()
            case .veil:
                // その場所の明かり。画面の **ふちから内側へ** 薄れる帯で、
                // まん中（＝子どもの顔がある辺り）には届かない。
                // 終わりの点から先は塗らない ＝ そこから向こうは元の絵のまま。
                guard primitive.points.count >= 2 else { continue }
                let from = mapper.map(primitive.points[0]), to = mapper.map(primitive.points[1])
                let airAlpha = CGFloat(min(maxAirAlpha,fxClamp(c.alpha)))
                guard airAlpha > 0.004 else { continue }
                let red = CGFloat(fxClamp(c.red)), green = CGFloat(fxClamp(c.green)), blue = CGFloat(fxClamp(c.blue))
                guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                      let gradient = CGGradient(colorsSpace: space,colors: [
                        CGColor(red: red,green: green,blue: blue,alpha: airAlpha),
                        CGColor(red: red,green: green,blue: blue,alpha: 0),
                      ] as CFArray,locations: [0,1]) else { continue }
                context.saveGState()
                // かげ（暗くなる空気）だけ .normal。光を足すやり方では暗さは出せない。
                context.setBlendMode(primitive.blend == .over ? .normal : .plusLighter)
                context.drawLinearGradient(gradient,start: CGPoint(x: from.x,y: from.y),
                                           end: CGPoint(x: to.x,y: to.y),options: [.drawsBeforeStartLocation])
                context.restoreGState()
            case .halo:
                // ふちだけが色づく（または暗くなる）輪。まん中は素通し。
                let centre = mapper.map(primitive.points[0])
                let reach = min(maxAirRadius,primitive.radius)*short
                let airAlpha = CGFloat(min(maxAirAlpha,fxClamp(c.alpha)))
                guard reach > 1, airAlpha > 0.004 else { continue }
                let red = CGFloat(fxClamp(c.red)), green = CGFloat(fxClamp(c.green)), blue = CGFloat(fxClamp(c.blue))
                guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                      let gradient = CGGradient(colorsSpace: space,colors: [
                        CGColor(red: red,green: green,blue: blue,alpha: 0),
                        CGColor(red: red,green: green,blue: blue,alpha: airAlpha*0.22),
                        CGColor(red: red,green: green,blue: blue,alpha: airAlpha),
                      ] as CFArray,locations: [0,0.62,1]) else { continue }
                context.saveGState()
                context.setBlendMode(primitive.blend == .over ? .normal : .plusLighter)
                // 角は端の半径より遠いので、その先も塗る（塗らないと四隅だけ抜ける）。
                context.drawRadialGradient(gradient,startCenter: CGPoint(x: centre.x,y: centre.y),startRadius: 0,
                                           endCenter: CGPoint(x: centre.x,y: centre.y),endRadius: reach,
                                           options: [.drawsAfterEndLocation])
                context.restoreGState()
            case .spray:
                // 粉のように散らす小さな印（吹雪・火の粉・花びら・きらめき）。
                // **1つの primitive に点をたくさん入れる。** 1粒ずつ primitive に
                // すると、雪を降らせるだけで上限に当たってしまう。
                // どんな印かは glyphID（dot / dash / star / petal）。
                let size = min(maxRadius,primitive.radius)*short
                guard size > 0.4 else { continue }
                context.saveGState()
                // 空気の中のもの（雪・花びら）は `over`。**白い壁に白い光を足しても
                // 雪は見えない。** 光そのもの（火の粉・星）は今までどおり足す。
                context.setBlendMode(primitive.blend == .over ? .normal : .plusLighter)
                context.setFillColor(colour); context.setStrokeColor(colour)
                let mark = primitive.glyphID ?? "dot"
                let angle = primitive.angle
                // 空気の中のもの（雪・花びら）は形が残るように芯を固く、
                // 光そのもの（火の粉・きらめき）は ふんわり。
                let space = CGColorSpace(name: CGColorSpace.sRGB)
                let soft = space.flatMap {
                    softDot(c,alpha: alpha,core: primitive.blend == .over ? 0.70 : 0.38,space: $0)
                }
                for (index,point) in primitive.points.prefix(32).enumerated() {
                    let p = mapper.map(point)
                    // 粒ごとに大きさを変える。ぜんぶ同じだと機械が並べたように見える。
                    let r = size*(0.55+0.45*Double((index&*37)%11)/10)
                    switch mark {
                    case "dash":
                        context.setLineWidth(max(0.8,r*0.55))
                        context.beginPath()
                        context.move(to: CGPoint(x: p.x-cos(angle)*r*1.8,y: p.y-sin(angle)*r*1.8))
                        context.addLine(to: CGPoint(x: p.x+cos(angle)*r*1.8,y: p.y+sin(angle)*r*1.8))
                        context.strokePath()
                    case "star":
                        // 十字の光条＋まん中の点。小さくても「きらっ」と読める。
                        context.setLineWidth(max(0.8,r*0.34))
                        context.beginPath()
                        context.move(to: CGPoint(x: p.x-r*2,y: p.y)); context.addLine(to: CGPoint(x: p.x+r*2,y: p.y))
                        context.move(to: CGPoint(x: p.x,y: p.y-r*2)); context.addLine(to: CGPoint(x: p.x,y: p.y+r*2))
                        context.strokePath()
                        if let soft {
                            context.drawRadialGradient(soft,startCenter: CGPoint(x: p.x,y: p.y),
                                startRadius: 0,endCenter: CGPoint(x: p.x,y: p.y),
                                endRadius: CGFloat(r*1.5),options: [])
                        } else {
                            context.fillEllipse(in: CGRect(x: p.x-r*0.6,y: p.y-r*0.6,width: r*1.2,height: r*1.2))
                        }
                    case "petal":
                        // 粒ごとに向きを変えた楕円。舞っているように見せる。
                        let a = angle+Double((index&*53)%17)/17*2*Double.pi
                        context.saveGState()
                        context.translateBy(x: p.x,y: p.y); context.rotate(by: CGFloat(a))
                        context.fillEllipse(in: CGRect(x: -r*0.55,y: -r*1.3,width: r*1.1,height: r*2.6))
                        context.restoreGState()
                    default:
                        // やわらかい粒。ふちの立った円をやめて、まん中から外へ
                        // 薄れる放射グラデで描く（**ここが「安っぽい」の正体の一つ**）。
                        if let soft {
                            context.drawRadialGradient(soft,startCenter: CGPoint(x: p.x,y: p.y),
                                startRadius: 0,endCenter: CGPoint(x: p.x,y: p.y),
                                endRadius: CGFloat(r*(primitive.blend == .over ? 1.3 : 1.8)),options: [])
                        } else {
                            context.fillEllipse(in: CGRect(x: p.x-r,y: p.y-r,width: r*2,height: r*2))
                        }
                    }
                }
                context.restoreGState()
            }
        }
    }
}

/// ブルーム（にじみ）の強さ。**これが「安っぽい光」と「きれいな光」の差。**
/// 線を何本重ねても、まわりの空気が光らないと 絵に貼った線に見える。
/// ぼかした複製を足す（`CIGaussianBlur` ＋ `CIAdditionCompositing`）。
public struct FXBloom: Sendable {
    /// ぼかしの半径。**出力の長辺に対する割合**（0.006 ≒ 1920px で 12px）。
    public var radiusFraction: Double
    /// にじみを どれだけ足すか。
    public var strength: Double
    public init(radiusFraction: Double = 0.006, strength: Double = 0.9) {
        self.radiusFraction = fxClamp(radiusFraction,0,0.05)
        self.strength = fxClamp(strength,0,2)
    }
    public static let standard = FXBloom()
    public static let off = FXBloom(radiusFraction: 0,strength: 0)
}

/// Thread-safe reusable small overlay raster. Video frames themselves stay in Core Image / AVFoundation.
///
/// **層は2枚。** 空気（`over`・部屋を暗くしたり色を差したり）はそのまま上に置き、
/// 光（`add`）は ブルームを敷いてから上に置く。1枚で済ませると、ブルームが
/// 「暗くする空気」まで明るくしてしまう。
final class OverlayRasterizer: @unchecked Sendable {
    private let lock = NSLock()
    private var contexts: [FXPaintLayer: CGContext] = [:]
    private var dimensions = CGSize.zero
    private let catalog: EffectCatalog
    init(catalog: EffectCatalog) { self.catalog = catalog }
    /// 光る線は輪郭がはっきりしているので、768 で描いて 1920 に伸ばすと
    /// ふちがぼやける。1280 で描く（絵のあるコマだけ・1枚を使い回し）。
    func image(for scene: EffectScene, layer: FXPaintLayer = .all,
               maximumEdge: Int = 1280) throws -> CIImage? {
        guard !scene.primitives.isEmpty, scene.sourceSize.isValid else { return nil }
        // その層に何も無いコマでは 焼かない（空気だけのコマは光の層を作らない）。
        guard layer == .all || scene.primitives.prefix(32)
                .contains(where: { ($0.blend == .over) == (layer == .air) }) else { return nil }
        lock.lock(); defer { lock.unlock() }
        let scale = min(1,Double(maximumEdge)/max(scene.sourceSize.width,scene.sourceSize.height))
        let w = max(2,Int((scene.sourceSize.width*scale).rounded()))
        let h = max(2,Int((scene.sourceSize.height*scale).rounded()))
        let size = CGSize(width: w,height: h)
        if dimensions != size { contexts.removeAll(); dimensions = size }
        let context: CGContext
        if let existing = contexts[layer] { context = existing }
        else {
            guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
                  let made = CGContext(data: nil,width: w,height: h,bitsPerComponent: 8,bytesPerRow: 0,
                    space: colorSpace,bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw FXError.invalidData("Unable to allocate the transparent effect overlay.")
            }
            contexts[layer] = made; context = made
        }
        context.clear(CGRect(origin: .zero,size: size))
        context.saveGState()
        context.translateBy(x: 0,y: CGFloat(h)); context.scaleBy(x: 1,y: -1)
        EffectPainter.draw(scene,in: context,viewport: size,catalog: catalog,layer: layer)
        context.restoreGState()
        guard let image = context.makeImage() else { throw FXError.invalidData("Unable to render the transparent effect overlay.") }
        return CIImage(cgImage: image)
    }

    /// 1コマを組み立てる。**書き出し（アプリ）と ハーネス（Mac）は必ずここを通る。**
    /// 別々に組み立てると「Mac で見た絵」と「アプリが作る絵」が違うものになる。
    ///
    /// 順番に意味がある: 空気 → **にじみ** → 光。にじみを光より先に足すと、
    /// 芯はにじみの上に乗るので くっきり残り、まわりだけが やわらかく光る。
    /// にじみを最後に足すと 芯まで明るくなって、また白飛びする。
    func composite(scene: EffectScene, over base: CIImage, outputRect: CGRect,
                   bloom: FXBloom = .standard) throws -> CIImage {
        guard outputRect.width > 1, outputRect.height > 1 else { return base }
        var result = base
        func fitted(_ overlay: CIImage) -> CIImage? {
            guard overlay.extent.width > 0, overlay.extent.height > 0 else { return nil }
            return overlay.transformed(by: .init(scaleX: outputRect.width/overlay.extent.width,
                                                 y: outputRect.height/overlay.extent.height))
        }
        if let air = try image(for: scene,layer: .air), let sheet = fitted(air) {
            result = sheet.composited(over: result)
        }
        if let light = try image(for: scene,layer: .light), let sheet = fitted(light) {
            let sigma = Double(max(outputRect.width,outputRect.height))*bloom.radiusFraction
            if bloom.strength > 0.01, sigma > 0.5 {
                let s = CGFloat(bloom.strength)
                let blurred = sheet.clampedToExtent()
                    .applyingFilter("CIGaussianBlur",parameters: [kCIInputRadiusKey: sigma])
                    .cropped(to: outputRect)
                    .applyingFilter("CIColorMatrix",parameters: [
                        "inputRVector": CIVector(x: s,y: 0,z: 0,w: 0),
                        "inputGVector": CIVector(x: 0,y: s,z: 0,w: 0),
                        "inputBVector": CIVector(x: 0,y: 0,z: s,w: 0),
                        "inputAVector": CIVector(x: 0,y: 0,z: 0,w: s)])
                result = blurred.applyingFilter("CIAdditionCompositing",
                                                parameters: [kCIInputBackgroundImageKey: result])
            }
            result = sheet.composited(over: result)
        }
        return result
    }
}

#endif
