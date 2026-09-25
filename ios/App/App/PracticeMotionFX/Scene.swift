import Foundation

public struct FXPrimitive: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case ring, stroke, glyph, orb }
    public var kind: Kind; public var points: [FXPoint]; public var color: FXColor
    /// Radius/size/lineWidth are fractions of the displayed VIDEO's shorter edge.
    public var radius: Double; public var lineWidth: Double
    public var glyphID: String?; public var angle: Double
    public init(kind: Kind, points: [FXPoint], color: FXColor, radius: Double = 0,
                lineWidth: Double = 0.002, glyphID: String? = nil, angle: Double = 0) {
        self.kind = kind; self.points = points; self.color = color; self.radius = radius
        self.lineWidth = lineWidth; self.glyphID = glyphID; self.angle = angle
    }
}
public struct EffectScene: Codable, Sendable, Equatable {
    public var sourceSize: FXSize
    public var primitives: [FXPrimitive]
    public init(sourceSize: FXSize, primitives: [FXPrimitive] = []) {
        self.sourceSize = sourceSize; self.primitives = primitives
    }
}
public enum SceneBuilder {

    /// 印の大きさ（短いほうの辺に対する割合）。実写で測って決めた値:
    /// これより小さいと、iPhone の画面で見たときに何の形か分からない。
    static let stickerSize = 0.095
    /// 気のたまの大きさ。**こぶしを包むくらい** — 小さいと ただの青い点に見える。
    static let orbSize = 0.085
    /// 印のキラキラが、突いていないあいだ 手についてまわる小さな光。
    /// ここを細い輪にすると、印のとなりに ⊙ が並んで じゃまになる。
    static let traceSize = 0.032

    public static func make(frame: EffectFrame, at time: Double, history: [EffectFrame] = [],
                            preset: EffectPreset, intensity: Double = 1,
                            reduceMotion: Bool = false) -> EffectScene {
        var scene = EffectScene(sourceSize: frame.sourceSize)
        let age = time-frame.time
        guard time.isFinite, age >= -0.001, age <= 0.18, frame.sourceSize.isValid else { return scene }
        let staleFade = fxClamp((0.18-max(0,age))/0.08)
        let strength = fxClamp(intensity)*staleFade
        guard strength > 0 else { return scene }
        let aspect = frame.sourceSize.aspect
        let shortToY = min(aspect,1), shortToX = min(1,1/aspect)
        let isOrb = preset.style == "orb"
        let sticker = preset.style == "sticker" ? preset.glyph : nil
        let baseAlpha = fxClamp(preset.opacity)
        let anchors = frame.anchors.filter { a in
            a.point.inUnitSquare && a.confidence >= 0.2 &&
            (preset.mode == .piano ? a.joint.isHandSlot : !a.joint.isHandSlot)
        }.sorted { a,b in
            if a.energy == b.energy { return a.joint.rawValue < b.joint.rawValue }
            return a.energy > b.energy
        }.prefix(preset.maxAnchors)
        for anchor in anchors {
            let energy = fxClamp(anchor.energy)
            // No ambient static rings: effects need real visible movement.
            guard energy > 0.025 else { continue }
            let radius = min(0.035,preset.radius)*(0.80+0.20*energy)
            // かざりが顔にかからないように。印は輪よりずっと大きいので、よける
            // 幅もそれに合わせる（輪の大きさで測ると、星が顔に乗る）。
            let keepOut = max((isOrb ? orbSize : radius)*shortToX,(isOrb ? orbSize : radius)*shortToY)*1.4
            if let head = frame.headExclusion, head.contains(anchor.point, padding: keepOut) { continue }
            let alpha = baseAlpha*strength*(0.80+0.20*energy)
            let color = preset.color.opacity(alpha)
            // 気のたま は、動いているあいだ ずっと こぶしが光る。輪は「どこを見て
            // いるか」の目印なので、気のたまのときは要らない（二重に見える）。
            if isOrb {
                scene.primitives.append(.init(kind: .orb, points: [anchor.point], color: color,
                                              radius: orbSize*(0.75+0.35*energy)))
            } else if sticker != nil {
                scene.primitives.append(.init(kind: .orb, points: [anchor.point],
                                              color: color.opacity(0.75),
                                              radius: traceSize*(0.80+0.40*energy)))
            } else {
                scene.primitives.append(.init(kind: .ring, points: [anchor.point], color: color,
                                              radius: radius, lineWidth: 0.008))
            }
            guard !reduceMotion else { continue }
            if preset.trailSeconds > 0.01 && energy > 0.12 {
                var trail: [FXPoint] = [anchor.point]
                // Walk backward only while continuity is intact. Never connect across tracking loss.
                for h in history.reversed() {
                    guard h.time < frame.time else { continue }
                    if frame.time-h.time > preset.trailSeconds || h.generation != frame.generation { break }
                    guard let old = h.anchors.first(where: { $0.joint == anchor.joint }) else { break }
                    if anchor.point.distance(to: old.point, aspect: aspect) > 0.075*shortToY { break }
                    if let head = frame.headExclusion, head.contains(old.point, padding: 0.02) { break }
                    trail.append(old.point)
                    if trail.count >= 5 { break }
                }
                if trail.count >= 2 {
                    scene.primitives.append(.init(kind: .stroke, points: trail.reversed(),
                                                   color: color.opacity(isOrb ? 0.85 : 0.55),
                                                   lineWidth: isOrb ? 0.016 : 0.008))
                }
            }
            guard let burst = anchor.lastBurst, time >= burst else { continue }
            let progress = (time-burst)/preset.burstSeconds
            guard progress >= 0, progress < 1 else { continue }
            // Plateau, not a spike: a pure sine peaks for two or three frames and the ⭐️
            // is gone before a child's eye lands on it. Still rises and falls at the edges.
            let envelope = min(1,sin(Double.pi*progress)*2.4)
            if let sticker {
                scene.primitives.append(stickerPrimitive(
                    at: anchor.point, glyph: sticker, color: color.opacity(envelope),
                    progress: progress, shortToX: shortToX, shortToY: shortToY))
            } else if isOrb {
                // 突いた瞬間だけ、たまが ふくらんで白く光る。
                scene.primitives.append(.init(kind: .orb, points: [anchor.point],
                                               color: preset.color.opacity(baseAlpha*strength*envelope),
                                               radius: orbSize*(1.05+0.35*progress)))
            } else {
                scene.primitives.append(.init(kind: .ring, points: [anchor.point],
                                               color: color.opacity((1-progress)*0.55),
                                               radius: radius*(1+0.9*progress), lineWidth: 0.004))
            }
        }
        // 印は「ここで突いた」という一回きりのしるし。追跡が切れるのは まさに速く
        // 動いた瞬間なので、切れた途端に消えると誰の目にも留まらない。見えなく
        // なったあとも、最後に分かっている場所に burstSeconds のあいだ出しておく。
        // 印はその場から動かないので、外れた場所を追いかけることにはならない。
        if let sticker {
            let drawn = Set(anchors.map(\.joint))
            var stamped = Set<FXJoint>()
            for past in history.reversed() where past.generation == frame.generation {
                guard stamped.count < preset.maxAnchors else { break }
                for a in past.anchors {
                    guard !drawn.contains(a.joint), !stamped.contains(a.joint),
                          a.point.inUnitSquare, a.confidence >= 0.2,
                          preset.mode == .piano ? a.joint.isHandSlot : !a.joint.isHandSlot,
                          let burst = a.lastBurst, time >= burst else { continue }
                    let progress = (time-burst)/preset.burstSeconds
                    guard progress >= 0, progress < 1 else { continue }
                    stamped.insert(a.joint)
                    // The wrist may still be known this frame even when it was too slow
                    // to earn a ring; prefer that over the older position.
                    let point = frame.anchors.first { $0.joint == a.joint }?.point ?? a.point
                    if let head = frame.headExclusion ?? past.headExclusion,
                       head.contains(point, padding: max(stickerSize*shortToX,stickerSize*shortToY)*0.9) { continue }
                    let envelope = min(1,sin(Double.pi*progress)*2.4)
                    scene.primitives.append(stickerPrimitive(
                        at: point, glyph: sticker,
                        color: preset.color.opacity(baseAlpha*strength*envelope),
                        progress: progress, shortToX: shortToX, shortToY: shortToY))
                }
            }
        }
        // A hard budget prevents a future preset from becoming a particle storm.
        scene.primitives = Array(scene.primitives.prefix(8))
        return scene
    }

    /// こぶしの すぐ上・少し外側に浮かべる。指やこぶしの上には置かない
    /// （何をしているか見えなくなる）。上がるにつれて少し持ち上がる。
    private static func stickerPrimitive(at point: FXPoint, glyph: String, color: FXColor,
                                         progress: Double, shortToX: Double, shortToY: Double) -> FXPrimitive {
        let center = point + .init(stickerSize*shortToX*0.55,
                                   -stickerSize*shortToY*(0.95+progress*0.35))
        return .init(kind: .glyph, points: [center], color: color, radius: stickerSize,
                     lineWidth: 0.006, glyphID: glyph, angle: glyph == "bolt" ? -0.20 : 0)
    }
}
