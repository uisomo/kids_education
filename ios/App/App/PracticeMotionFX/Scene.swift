import Foundation

public struct FXPrimitive: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case ring, stroke, glyph }
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
        let anchors = frame.anchors.filter { a in
            a.point.inUnitSquare && a.confidence >= 0.2 &&
            (preset.mode == .piano ? a.joint.isHandSlot : !a.joint.isHandSlot) &&
            (preset.style != "arc" || a.joint.isFoot)
        }.sorted { a,b in
            if a.energy == b.energy { return a.joint.rawValue < b.joint.rawValue }
            return a.energy > b.energy
        }.prefix(preset.maxAnchors)
        for anchor in anchors {
            let energy = fxClamp(anchor.energy)
            // No ambient static rings: effects need real visible movement.
            guard energy > 0.025 else { continue }
            let radius = min(0.035,preset.radius)*(0.80+0.20*energy)
            // Suppress the whole decoration near the face; never draw on top of it.
            if let head = frame.headExclusion,
               head.contains(anchor.point, padding: max(radius*shortToX,radius*shortToY)*2.4) { continue }
            let alpha = min(0.70,preset.opacity)*strength*(0.25+0.75*energy)
            let color = preset.color.opacity(alpha)
            scene.primitives.append(.init(kind: .ring, points: [anchor.point], color: color,
                                           radius: radius, lineWidth: 0.0022))
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
                                                   color: color.opacity(0.55), lineWidth: 0.003))
                }
            }
            guard let burst = anchor.lastBurst, time >= burst else { continue }
            let progress = (time-burst)/preset.burstSeconds
            guard progress >= 0, progress < 1 else { continue }
            let envelope = sin(Double.pi*progress) // smooth rise/fall; no full-frame flashes
            if anchor.joint.isFoot || preset.style == "arc" {
                var points: [FXPoint] = []
                for i in 0...10 {
                    let a = Double(i)/10*Double.pi*0.85-Double.pi*0.92
                    let r = radius*(1.1+0.35*progress)
                    points.append(anchor.point + .init(cos(a)*r*shortToX,sin(a)*r*shortToY))
                }
                scene.primitives.append(.init(kind: .stroke, points: points,
                                               color: color.opacity(envelope*0.65), lineWidth: 0.002))
            } else if preset.style == "lightning" || preset.style == "notes" || preset.style == "pearl" {
                let glyph = preset.style == "lightning" ? "bolt" : preset.style == "notes" ? "note" : "spark"
                // Float above and slightly aside the wrist; do not cover fingers/keys with a filled sticker.
                let center = anchor.point + .init(radius*shortToX*1.1,-radius*shortToY*(1.3+progress*0.65))
                scene.primitives.append(.init(kind: .glyph, points: [center], color: color.opacity(envelope),
                                               radius: radius*1.05, lineWidth: 0.002,
                                               glyphID: glyph, angle: preset.style == "lightning" ? -0.25 : 0))
            } else if preset.style == "halo" {
                scene.primitives.append(.init(kind: .ring, points: [anchor.point],
                                               color: color.opacity((1-progress)*0.35),
                                               radius: radius*(1+0.45*progress), lineWidth: 0.0015))
            }
        }
        // A hard budget prevents a future preset from becoming a particle storm.
        scene.primitives = Array(scene.primitives.prefix(8))
        return scene
    }
}
