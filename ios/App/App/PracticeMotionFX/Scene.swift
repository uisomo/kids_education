import Foundation

public struct FXPrimitive: Codable, Sendable, Equatable {
    /// `glow` は「ネオン管」。painter が同じ線を3回（にじみ・色・白い芯）重ねる。
    /// エネルギーに見えるかどうかは ほぼこれで決まる。
    public enum Kind: String, Codable, Sendable { case ring, stroke, glow, orb, spray, ribbon }
    public var kind: Kind; public var points: [FXPoint]; public var color: FXColor
    /// Radius/size/lineWidth are fractions of the displayed VIDEO's shorter edge.
    public var radius: Double; public var lineWidth: Double
    public var glyphID: String?; public var angle: Double
    /// `ribbon` の 終わりの太さ（始まりに対する割合）。0 で先がとがる。
    /// **これが「安っぽい／かっこいい」を分ける。** 同じ太さのまま伸びる線は
    /// 炎にもドラゴンの尾にも見えない。
    public var taper: Double
    public init(kind: Kind, points: [FXPoint], color: FXColor, radius: Double = 0,
                lineWidth: Double = 0.002, glyphID: String? = nil, angle: Double = 0,
                taper: Double = 1) {
        self.kind = kind; self.points = points; self.color = color; self.radius = radius
        self.lineWidth = lineWidth; self.glyphID = glyphID; self.angle = angle
        self.taper = taper
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(Kind.self, forKey: .kind)
        points = try c.decode([FXPoint].self, forKey: .points)
        color = try c.decode(FXColor.self, forKey: .color)
        radius = try c.decodeIfPresent(Double.self, forKey: .radius) ?? 0
        lineWidth = try c.decodeIfPresent(Double.self, forKey: .lineWidth) ?? 0.002
        glyphID = try c.decodeIfPresent(String.self, forKey: .glyphID)
        angle = try c.decodeIfPresent(Double.self, forKey: .angle) ?? 0
        taper = try c.decodeIfPresent(Double.self, forKey: .taper) ?? 1
    }
}
public struct EffectScene: Codable, Sendable, Equatable {
    public var sourceSize: FXSize
    public var primitives: [FXPrimitive]
    public init(sourceSize: FXSize, primitives: [FXPrimitive] = []) {
        self.sourceSize = sourceSize; self.primitives = primitives
    }
}

/// 骨（肩→肘→手首）に沿って歩くための道。
///
/// 計算は **display 空間**（x に aspect を掛けた空間）でやる。そうしないと縦長の
/// 動画で「腕に巻きつく渦」が横につぶれた楕円になる。距離の単位は「縦の 1.0」で、
/// 短辺に対する割合から直すときは `shortToY` を掛ける。
private struct DisplayPath {
    var pts: [FXPoint]
    var cum: [Double]
    var total: Double
    init?(_ chain: [FXPoint], aspect: Double) {
        guard chain.count >= 2, chain.allSatisfy(\.isFinite) else { return nil }
        pts = chain.map { FXPoint($0.x*aspect, $0.y) }
        cum = [0]
        for i in 1..<pts.count {
            cum.append(cum[i-1]+hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y))
        }
        total = cum.last ?? 0
        guard total > 1e-6, total.isFinite else { return nil }
    }
    /// 道のりの割合 t の位置と、そこでの向き（長さ1）。
    func at(_ t: Double) -> (point: FXPoint, tangent: FXPoint) {
        let s = fxClamp(t)*total
        var i = 1
        while i < cum.count-1 && cum[i] < s { i += 1 }
        let a = pts[i-1], b = pts[i]
        let seg = max(1e-9, cum[i]-cum[i-1])
        let u = fxClamp((s-cum[i-1])/seg)
        return (FXPoint(a.x+(b.x-a.x)*u, a.y+(b.y-a.y)*u),
                FXPoint((b.x-a.x)/seg, (b.y-a.y)/seg))
    }
}

public enum SceneBuilder {

    // 見え方の基準（短辺に対する割合）。実写を見ながら決めた値。
    static let orbSize = 0.070          // こぶしの気のたま
    static let boltWidth = 0.009        // 稲妻の芯
    static let bandWidth = 0.013        // 帯
    static let auraWidth = 0.028        // 腕そいの太い光
    static let wrapAmplitude = 0.042    // 腕からどれだけ外へふくらむか
    static let boltJitter = 0.022       // 稲妻のギザギザ
    /// 稲妻を1秒に何回引き直すか。速すぎると ただのノイズ、遅いと止まって見える。
    static let boltPerSecond = 14.0
    /// 炎が ゆらぐ速さ。
    static let flamePerSecond = 11.0
    /// 帯が1秒に何回まわるか。
    static let spinPerSecond = 1.15

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
        let base = fxClamp(preset.opacity)*strength
        let style = preset.style

        let anchors = frame.anchors.filter { a in
            a.point.inUnitSquare && a.confidence >= 0.2 &&
            (preset.mode == .piano ? a.joint.isHandSlot : !a.joint.isHandSlot)
        }.sorted { a,b in
            if a.energy == b.energy { return a.joint.rawValue < b.joint.rawValue }
            return a.energy > b.energy
        }.prefix(preset.maxAnchors)

        func hidesBehindFace(_ p: FXPoint, pad: Double) -> Bool {
            guard let head = frame.headExclusion else { return false }
            return head.contains(p, padding: max(pad*shortToX, pad*shortToY))
        }

        // ── 腕／脚に まとわりつくところ ────────────────────────────────────
        // 手首の点に絵を貼るのではなく、**骨に沿って** 描く。骨が取れないコマ
        // （肩や肘が見つからない）では、下のこぶしの光だけになる。
        //
        // **style ごとに「動きかた」を変える。** 色だけ違う同じ線は、ぜんぶ
        // 同じものに見える（実際そう言われた）。炎は上へ立ちのぼり、氷は
        // まっすぐ角ばって生え、吹雪は流れ、風は通り過ぎる。
        if !reduceMotion {
            let limbs = frame.limbs
                .filter { $0.energy > 0.05 && $0.root.inUnitSquare && $0.mid.inUnitSquare && $0.tip.inUnitSquare }
                .sorted { $0.energy > $1.energy }
                .prefix(preset.maxAnchors)
            for (limbIndex, limb) in limbs.enumerated() {
                guard !hidesBehindFace(limb.tip, pad: wrapAmplitude),
                      !hidesBehindFace(limb.mid, pad: wrapAmplitude),
                      let path = DisplayPath([limb.root, limb.mid, limb.tip], aspect: aspect) else { continue }
                let energy = fxClamp(limb.energy)
                // 止まっている腕はうっすら、振った腕はくっきり。0 にはしない
                // （出たり消えたりがチカチカして見えるので）。
                let lit = base*(0.55+0.45*energy)
                let amp = wrapAmplitude*shortToY*(0.70+0.50*energy)
                let seed = limbIndex &* 9931
                let colour = preset.color

                switch style {

                case "lightning":
                    // パチパチさせるため、コマごとに引き直す。time を刻んだものを
                    // 種にしているので、同じ時刻なら必ず同じ形（書き出しをやり直しても
                    // 同じ絵になる）。
                    let tick = Int((time*boltPerSecond).rounded(.down))
                    for (index, spec) in [(0.0, 1.0, 1.7), (Double.pi, 0.62, 2.3)].enumerated() {
                        let (phase, weight, turns) = spec
                        let pts = wrap(path, aspect: aspect, samples: 26, amplitude: amp*weight,
                                       turns: turns, phase: phase,
                                       jitter: boltJitter*shortToY*weight, seed: tick &+ seed &+ index &* 7717)
                        scene.primitives.append(.init(kind: .glow, points: pts,
                                                      color: colour.opacity(lit*weight),
                                                      lineWidth: boltWidth*weight))
                    }
                    // 枝分かれ。稲妻らしさの半分はこれ。
                    for (index, at) in [0.52, 0.80].enumerated() {
                        let (p, dir) = path.at(at)
                        let n = FXPoint(-dir.y, dir.x)
                        let side: Double = index == 0 ? 1 : -1
                        var branch: [FXPoint] = []
                        for step in 0...3 {
                            let k = Double(step)/3
                            let out = amp*1.5*k*side
                            let drift = amp*0.5*(noise(tick &+ seed &+ index &* 131, step)-0.5)
                            let d = FXPoint(p.x+n.x*out+dir.x*drift, p.y+n.y*out+dir.y*drift)
                            branch.append(FXPoint(d.x/aspect, d.y))
                        }
                        scene.primitives.append(.init(kind: .glow, points: branch,
                                                      color: colour.opacity(lit*0.75),
                                                      lineWidth: boltWidth*0.6))
                    }

                case "flame":
                    // 炎は **上へ立ちのぼる**。腕の向きに関係なく、いつも画面の上へ。
                    // 舌を3本、根元は太く先はとがらせて、コマごとに揺らす。
                    let tick = Int((time*flamePerSecond).rounded(.down))
                    for tongue in tongues(path, aspect: aspect, count: 3,
                                          length: amp*(2.3+1.2*energy), sway: amp*0.75,
                                          seed: tick &+ seed) {
                        scene.primitives.append(.init(kind: .ribbon, points: tongue,
                                                      color: colour.opacity(lit),
                                                      lineWidth: bandWidth*1.5, taper: 0))
                    }
                    // 芯。腕そのものが熱を持っているように見せる。
                    scene.primitives.append(.init(kind: .glow,
                        points: wrap(path, aspect: aspect, samples: 14, amplitude: amp*0.12,
                                     turns: 1, phase: time*2.2, jitter: 0, seed: 0),
                        color: colour.opacity(lit*0.9), lineWidth: bandWidth*0.9))
                    // 火の粉。上へ流れて消える。
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 14, spread: amp*0.9,
                                            drift: FXPoint(amp*0.5, -amp*3.4), speed: 1.4,
                                            time: time, seed: seed &+ 55),
                        color: colour.opacity(lit*0.85), radius: bandWidth*0.34, glyphID: "dot"))

                case "ice":
                    // 氷は **角ばって、まっすぐ生える**。ゆらさない（結晶は揺れない）。
                    // 腕から左右交互に、とがった結晶が伸びる。
                    for (index, shard) in shards(path, aspect: aspect, count: 5,
                                                 length: amp*(1.5+1.1*energy), seed: seed).enumerated() {
                        scene.primitives.append(.init(kind: .ribbon, points: shard,
                                                      color: colour.opacity(lit*(index % 2 == 0 ? 1 : 0.7)),
                                                      lineWidth: bandWidth*(index % 2 == 0 ? 1.25 : 0.85),
                                                      taper: 0))
                    }
                    // 骨に沿った 硬い直線。丸みを出さないため うねらせない。
                    scene.primitives.append(.init(kind: .glow,
                        points: wrap(path, aspect: aspect, samples: 6, amplitude: 0,
                                     turns: 0, phase: 0, jitter: 0, seed: 0),
                        color: colour.opacity(lit*0.8), lineWidth: bandWidth*0.7))

                case "blizzard":
                    // 吹雪は **流れる**。腕に貼りつくのではなく、まわりを通り過ぎる。
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 26, spread: amp*2.2,
                                            drift: FXPoint(-amp*4.5, amp*2.2), speed: 1.9,
                                            time: time, seed: seed &+ 12),
                        color: colour.opacity(lit), radius: bandWidth*0.30,
                        glyphID: "dash", angle: 2.68))
                    // 風すじ。2本だけ、速く。
                    for index in 0..<2 {
                        let at = ((time*1.7+Double(index)*0.5).truncatingRemainder(dividingBy: 1))
                        scene.primitives.append(.init(kind: .ribbon,
                            points: streak(path, aspect: aspect, at: at,
                                           length: amp*3.4, drift: FXPoint(-amp*2.6, amp*1.3)),
                            color: colour.opacity(lit*0.8), lineWidth: bandWidth*0.8, taper: 0))
                    }

                case "water":
                    // なめらかに うねる。太くて やわらかい。
                    let phase = time*spinPerSecond*2*Double.pi*0.8
                    for (offset, weight) in [(0.0, 1.0), (Double.pi, 0.45)] {
                        scene.primitives.append(.init(kind: .ribbon,
                            points: wrap(path, aspect: aspect, samples: 30, amplitude: amp*1.1,
                                         turns: 1.8, phase: phase+offset, jitter: 0, seed: 0),
                            color: colour.opacity(lit*weight),
                            lineWidth: bandWidth*1.7*(weight == 1 ? 1 : 0.6), taper: 0.25))
                    }
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 10, spread: amp*1.3,
                                            drift: FXPoint(amp*0.8, amp*2.6), speed: 1.1,
                                            time: time, seed: seed &+ 71),
                        color: colour.opacity(lit*0.8), radius: bandWidth*0.32, glyphID: "dot"))

                case "wind":
                    // 風は **通り過ぎる**。三日月が腕に沿って流れていく。
                    for index in 0..<3 {
                        let at = ((time*1.25+Double(index)/3).truncatingRemainder(dividingBy: 1))
                        scene.primitives.append(.init(kind: .ribbon,
                            points: crescent(path, aspect: aspect, at: at, span: amp*2.6, bow: amp*1.1),
                            color: colour.opacity(lit*(1-abs(at-0.5)*0.7)),
                            lineWidth: bandWidth*1.1, taper: 0))
                    }

                case "sparkle":
                    // きらめき。粒が ちかちかして、腕のまわりで またたく。
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 16, spread: amp*1.6,
                                            drift: FXPoint(0, -amp*1.1), speed: 0.7,
                                            time: time, seed: seed &+ 903),
                        color: colour.opacity(lit), radius: bandWidth*0.55, glyphID: "star"))
                    scene.primitives.append(.init(kind: .glow,
                        points: wrap(path, aspect: aspect, samples: 20, amplitude: amp*0.5,
                                     turns: 1.6, phase: time*1.4, jitter: 0, seed: 0),
                        color: colour.opacity(lit*0.45), lineWidth: bandWidth*0.55))

                case "petal":
                    // 花びらが 腕のまわりを 舞う。
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 14, spread: amp*1.8,
                                            drift: FXPoint(amp*1.6, amp*2.2), speed: 0.85,
                                            time: time, seed: seed &+ 421),
                        color: colour.opacity(lit), radius: bandWidth*0.62,
                        glyphID: "petal", angle: time*1.3))
                    scene.primitives.append(.init(kind: .glow,
                        points: wrap(path, aspect: aspect, samples: 24, amplitude: amp*0.7,
                                     turns: 2.0, phase: time*1.0, jitter: 0, seed: 0),
                        color: colour.opacity(lit*0.40), lineWidth: bandWidth*0.6))

                case "shadow":
                    // 影。太くて ふちがぎざぎざ。ゆっくり うねる。
                    let tick = Int((time*6).rounded(.down))
                    for (index, weight) in [1.0, 0.55].enumerated() {
                        scene.primitives.append(.init(kind: .ribbon,
                            points: wrap(path, aspect: aspect, samples: 22, amplitude: amp*0.9*weight,
                                         turns: 1.3, phase: time*0.9+Double(index)*2.1,
                                         jitter: amp*0.35, seed: tick &+ seed &+ index &* 311),
                            color: colour.opacity(lit*weight),
                            lineWidth: auraWidth*(index == 0 ? 1 : 0.55), taper: 0.3))
                    }
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 10, spread: amp*1.7,
                                            drift: FXPoint(0, -amp*1.6), speed: 0.9,
                                            time: time, seed: seed &+ 77),
                        color: colour.opacity(lit*0.7), radius: bandWidth*0.45, glyphID: "dot"))

                case "dragon":
                    // 長い胴が腕に巻きつき、**手首の先まで抜けて** 尾になる。
                    scene.primitives.append(.init(kind: .ribbon,
                        points: serpent(path, aspect: aspect, turns: 3.0, amplitude: amp*1.15,
                                        phase: time*spinPerSecond*2*Double.pi, overshoot: 0.45),
                        color: colour.opacity(lit), lineWidth: bandWidth*2.1, taper: 0))
                    scene.primitives.append(.init(kind: .ribbon,
                        points: serpent(path, aspect: aspect, turns: 3.0, amplitude: amp*1.15,
                                        phase: time*spinPerSecond*2*Double.pi+Double.pi, overshoot: 0.2),
                        color: colour.opacity(lit*0.45), lineWidth: bandWidth*1.1, taper: 0))
                    scene.primitives.append(.init(kind: .spray,
                        points: sprayPoints(path, aspect: aspect, count: 9, spread: amp*1.4,
                                            drift: FXPoint(amp*1.2, -amp*1.8), speed: 1.3,
                                            time: time, seed: seed &+ 313),
                        color: colour.opacity(lit*0.8), radius: bandWidth*0.36, glyphID: "dot"))

                case "rainbow":
                    // 7色は多すぎるので3本。preset の色は使わない（虹だから）。
                    let hues: [FXColor] = [.init(1, 0.30, 0.32), .init(0.35, 1, 0.55), .init(0.45, 0.62, 1)]
                    for (index, hue) in hues.enumerated() {
                        scene.primitives.append(.init(kind: .ribbon,
                            points: wrap(path, aspect: aspect, samples: 28,
                                         amplitude: amp*(0.75+0.25*Double(index)),
                                         turns: 2.4, phase: time*spinPerSecond*2*Double.pi+Double(index)*0.7,
                                         jitter: 0, seed: 0),
                            color: hue.opacity(lit*0.9), lineWidth: bandWidth*1.15, taper: 0.4))
                    }

                case "aura":
                    // 腕そのものが太く光る（気をまとっている感じ）。ゆっくり脈打つ。
                    let pulse = 0.85+0.15*sin(time*5.5)
                    scene.primitives.append(.init(kind: .glow,
                        points: wrap(path, aspect: aspect, samples: 18, amplitude: amp*0.18,
                                     turns: 1.0, phase: time*1.6, jitter: 0, seed: 0),
                        color: colour.opacity(lit*0.85*pulse), lineWidth: auraWidth))

                default: // "ribbon"
                    // ぐるぐる回る帯。時間で位相が進むので、腕が止まっていても回り続ける。
                    let phase = time*spinPerSecond*2*Double.pi
                    for (offset, weight) in [(0.0, 1.0), (Double.pi, 0.42)] {
                        scene.primitives.append(.init(kind: .ribbon,
                            points: wrap(path, aspect: aspect, samples: 30, amplitude: amp,
                                         turns: 2.6, phase: phase+offset, jitter: 0, seed: 0),
                            color: colour.opacity(lit*weight),
                            lineWidth: bandWidth*1.4*(weight == 1 ? 1 : 0.6), taper: 0.35))
                    }
                }
            }
        }

        // ── こぶし（手首・足首）────────────────────────────────────────────
        for anchor in anchors {
            let energy = fxClamp(anchor.energy)
            guard energy > 0.025 else { continue }
            if hidesBehindFace(anchor.point, pad: orbSize) { continue }
            let lit = base*(0.70+0.30*energy)

            // 気のたま。どの style でも「手が光っている」ことは伝えたいので共通。
            let ballScale = style == "aura" ? 1.15 : style == "blizzard" || style == "sparkle" ? 0.55 : 0.78
            scene.primitives.append(.init(kind: .orb, points: [anchor.point],
                                          color: preset.color.opacity(lit),
                                          radius: orbSize*ballScale*(0.80+0.30*energy)))

            guard !reduceMotion else { continue }

            // 残像（速く動いたときだけ伸びる）。
            if preset.trailSeconds > 0.01 && energy > 0.10 {
                var trail: [FXPoint] = [anchor.point]
                // Walk backward only while continuity is intact. Never connect across tracking loss.
                for h in history.reversed() {
                    guard h.time < frame.time else { continue }
                    if frame.time-h.time > preset.trailSeconds || h.generation != frame.generation { break }
                    guard let old = h.anchors.first(where: { $0.joint == anchor.joint }) else { break }
                    if anchor.point.distance(to: old.point, aspect: aspect) > 0.075*shortToY { break }
                    if hidesBehindFace(old.point, pad: 0.02) { break }
                    trail.append(old.point)
                    if trail.count >= 6 { break }
                }
                if trail.count >= 2 {
                    scene.primitives.append(.init(kind: .ribbon, points: trail.reversed(),
                                                  color: preset.color.opacity(lit*0.70),
                                                  lineWidth: bandWidth*(0.7+0.7*energy), taper: 0))
                }
            }
        }

        // ── 当たった瞬間の衝撃波（style によらず共通）────────────────────────
        // 突きが「決まった」一瞬。輪が広がって、まわりに線が散る。
        if !reduceMotion, let hit = anchors.first(where: { $0.lastBurst != nil }),
           let burst = hit.lastBurst, time >= burst,
           !hidesBehindFace(hit.point, pad: orbSize*2) {
            let progress = (time-burst)/preset.burstSeconds
            if progress >= 0, progress < 1 {
                let fade = (1-progress)*(1-progress)
                let r = orbSize*(0.9+2.4*progress)
                // 輪も光らせる（ただの円を1本引くと、照準マークに見えてしまう）。
                var ring: [FXPoint] = []
                for k in 0...24 {
                    let a = Double(k)/24*2*Double.pi
                    ring.append(hit.point + .init(cos(a)*r*shortToX, sin(a)*r*shortToY))
                }
                scene.primitives.append(.init(kind: .glow, points: ring,
                                              color: preset.color.opacity(base*fade*0.85),
                                              lineWidth: bandWidth*fade*1.2))
                // 散る線。輪の **外側** から出す。輪に触れていると照準に見える。
                // 4本だけ（多いと画面がうるさくなる）。
                for k in 0..<4 {
                    let a = Double(k)/4*2*Double.pi+0.4
                    let inner = r*1.25, outer = inner+orbSize*1.1*fade
                    let dx = cos(a)*shortToX, dy = sin(a)*shortToY
                    scene.primitives.append(.init(kind: .ribbon, points: [
                        hit.point + .init(dx*inner, dy*inner),
                        hit.point + .init(dx*outer, dy*outer),
                    ], color: preset.color.opacity(base*fade*0.9), lineWidth: boltWidth*1.4, taper: 0))
                }
            }
        }

        // A hard budget prevents a future preset from becoming a particle storm.
        scene.primitives = Array(scene.primitives.prefix(24))
        return scene
    }

    // ── 形を作るところ ────────────────────────────────────────────────────
    // どれも display 空間（x に aspect を掛けた空間）で計算して、最後に戻す。
    // そうしないと縦長の動画で、丸いはずのものが横につぶれる。

    /// 骨に沿って、左右にうねりながら進む折れ線。
    ///
    /// - `turns`: 骨の端から端までに何回まわるか。これが「ぐるぐる」の正体で、
    ///   正弦で左右に振ると、2D では らせんが腕に巻きついているように見える。
    /// - `phase`: 回転。時間で進めると回り続ける。
    /// - `jitter`: 稲妻のギザギザ（同じ seed なら必ず同じ形）。
    ///
    /// 両端は必ず骨の上に戻す（`sin(πu)` の包絡）。そうしないと、かざりが
    /// 腕から離れて宙に浮いて見える。
    private static func wrap(_ path: DisplayPath, aspect: Double, samples: Int,
                             amplitude: Double, turns: Double, phase: Double,
                             jitter: Double, seed: Int) -> [FXPoint] {
        var out: [FXPoint] = []
        out.reserveCapacity(samples+1)
        for i in 0...samples {
            let u = Double(i)/Double(samples)
            let (p, dir) = path.at(u)
            let n = FXPoint(-dir.y, dir.x)
            let envelope = sin(Double.pi*u)
            var offset = amplitude*sin(u*turns*2*Double.pi+phase)*envelope
            if jitter > 0 { offset += jitter*(noise(seed, i)-0.5)*envelope }
            let d = FXPoint(p.x+n.x*offset, p.y+n.y*offset)
            out.append(FXPoint(d.x/aspect, d.y))
        }
        return out
    }

    /// 炎の舌。骨の上から **画面の上へ** 立ちのぼる（腕の向きには従わない。
    /// 炎は腕に沿って流れず、いつも上へ行く）。
    private static func tongues(_ path: DisplayPath, aspect: Double, count: Int,
                                length: Double, sway: Double, seed: Int) -> [[FXPoint]] {
        var out: [[FXPoint]] = []
        for i in 0..<count {
            let t = (Double(i)+0.5)/Double(count)
            let (p, _) = path.at(t)
            let lean = (noise(seed, i&*7)-0.5)*sway*1.2
            var pts: [FXPoint] = []
            for k in 0...5 {
                let u = Double(k)/5
                let rise = -length*u                        // display は y が下向き
                let wobble = lean*u + sway*0.55*sin(u*3.4+Double(i)*1.7)*u
                pts.append(FXPoint((p.x+wobble)/aspect, p.y+rise))
            }
            out.append(pts)
        }
        return out
    }

    /// 氷の結晶。骨から **まっすぐ、角ばって** 生える。左右交互。
    /// 揺らさないのがだいじ（結晶が揺れると氷に見えない）。
    private static func shards(_ path: DisplayPath, aspect: Double, count: Int,
                               length: Double, seed: Int) -> [[FXPoint]] {
        var out: [[FXPoint]] = []
        for i in 0..<count {
            let t = (Double(i)+0.5)/Double(count)
            let (p, dir) = path.at(t)
            let n = FXPoint(-dir.y, dir.x)
            let side: Double = i % 2 == 0 ? 1 : -1
            // 長さと角度は結晶ごとに違うが、時間では変わらない（seed は腕ごと）。
            let len = length*(0.65+0.55*noise(seed, i&*3))
            let tilt = (noise(seed, i&*3+1)-0.5)*0.55
            let ax = n.x*side+dir.x*tilt, ay = n.y*side+dir.y*tilt
            let k = 1/max(1e-6, (ax*ax+ay*ay).squareRoot())
            // 3点だけ。途中で少しだけ折ると、面のある結晶に見える。
            out.append([
                FXPoint(p.x/aspect, p.y),
                FXPoint((p.x+ax*k*len*0.55-dir.x*len*0.12)/aspect, p.y+ay*k*len*0.55-dir.y*len*0.12),
                FXPoint((p.x+ax*k*len)/aspect, p.y+ay*k*len),
            ])
        }
        return out
    }

    /// 通り過ぎる三日月（風）。骨の `at` のあたりを横切る弧。
    private static func crescent(_ path: DisplayPath, aspect: Double, at: Double,
                                 span: Double, bow: Double) -> [FXPoint] {
        let (p, dir) = path.at(at)
        let n = FXPoint(-dir.y, dir.x)
        var out: [FXPoint] = []
        for i in 0...8 {
            let u = Double(i)/8*2-1                        // -1 … 1
            let along = span*u*0.5
            let out2 = bow*(1-u*u)                        // 弓なり
            let d = FXPoint(p.x+dir.x*along+n.x*out2, p.y+dir.y*along+n.y*out2)
            out.append(FXPoint(d.x/aspect, d.y))
        }
        return out
    }

    /// 吹雪の すじ。骨の `at` から `drift` の向きへ、まっすぐ流れる線。
    private static func streak(_ path: DisplayPath, aspect: Double, at: Double,
                               length: Double, drift: FXPoint) -> [FXPoint] {
        let (p, _) = path.at(at)
        let k = 1/max(1e-6, (drift.x*drift.x+drift.y*drift.y).squareRoot())
        let ux = drift.x*k, uy = drift.y*k
        return [FXPoint(p.x/aspect, p.y),
                FXPoint((p.x+ux*length)/aspect, p.y+uy*length)]
    }

    /// ドラゴンの胴。腕に巻きついたあと、手首の先へ `overshoot` ぶん抜けて
    /// 尾になる（`taper: 0` と組み合わせて先をとがらせる）。
    private static func serpent(_ path: DisplayPath, aspect: Double, turns: Double,
                                amplitude: Double, phase: Double, overshoot: Double) -> [FXPoint] {
        var out: [FXPoint] = []
        let total = 1+overshoot
        let samples = 34
        let (endPoint, endDir) = path.at(1)
        for i in 0...samples {
            let u = Double(i)/Double(samples)*total
            let onBone = u <= 1
            let (p, dir) = onBone ? path.at(u) : (endPoint, endDir)
            let extra = onBone ? 0 : (u-1)*path.total
            let n = FXPoint(-dir.y, dir.x)
            // 骨の上では端で閉じ、抜けたところでは細く伸ばす。
            let envelope = onBone ? sin(Double.pi*u) : max(0, 1-(u-1)/max(0.001,overshoot))*0.8
            let offset = amplitude*sin(u*turns*2*Double.pi+phase)*envelope
            let d = FXPoint(p.x+dir.x*extra+n.x*offset, p.y+dir.y*extra+n.y*offset)
            out.append(FXPoint(d.x/aspect, d.y))
        }
        return out
    }

    /// 骨のまわりに粒をばらまく。`drift` の向きへ流れて、端まで行くと戻る。
    private static func sprayPoints(_ path: DisplayPath, aspect: Double, count: Int,
                                    spread: Double, drift: FXPoint, speed: Double,
                                    time: Double, seed: Int) -> [FXPoint] {
        var out: [FXPoint] = []
        out.reserveCapacity(count)
        for i in 0..<count {
            let along = noise(seed, i&*3)
            let lateral = (noise(seed, i&*3+1)-0.5)*2*spread
            // 粒ごとに違う時点から始める。そろっていると行進に見える。
            let life = (time*speed+noise(seed, i&*3+2)).truncatingRemainder(dividingBy: 1)
            let (p, dir) = path.at(along)
            let n = FXPoint(-dir.y, dir.x)
            let d = FXPoint(p.x+n.x*lateral+drift.x*life, p.y+n.y*lateral+drift.y*life)
            out.append(FXPoint(d.x/aspect, d.y))
        }
        return out
    }

    /// 決まった答えを返す雑音（0...1）。乱数を使うと、書き出しをやり直すたびに
    /// 稲妻の形が変わってしまう（同じ動画から違う絵が出るのは避けたい）。
    private static func noise(_ a: Int, _ b: Int) -> Double {
        var h = UInt64(bitPattern: Int64(a &* 73856093 ^ b &* 19349663 ^ 0x5bf0_3635))
        h ^= h >> 33; h = h &* 0xff51_afd7_ed55_8ccd; h ^= h >> 33
        return Double(h % 10_007)/10_007
    }
}
