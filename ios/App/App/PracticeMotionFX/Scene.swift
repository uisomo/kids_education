import Foundation

public struct FXPrimitive: Codable, Sendable, Equatable {
    /// `glow` は「ネオン管」。painter が同じ線を3回（にじみ・色・白い芯）重ねる。
    /// エネルギーに見えるかどうかは ほぼこれで決まる。
    public enum Kind: String, Codable, Sendable { case ring, stroke, glow, orb }
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
    static let bandWidth = 0.013        // 渦の帯
    static let auraWidth = 0.028        // 腕そいの太い光
    static let wrapAmplitude = 0.042    // 腕からどれだけ外へふくらむか
    static let boltJitter = 0.022       // 稲妻のギザギザ
    /// 稲妻を1秒に何回引き直すか。速すぎると ただのノイズ、遅いと止まって見える。
    static let boltPerSecond = 14.0
    /// 渦が1秒に何回まわるか。
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
        // ここが肝。手首の点に絵を貼るのではなく、**骨に沿って** 描く。
        // 骨が取れないコマ（肩や肘が見つからない）では、下のこぶしの光だけになる。
        if !reduceMotion {
            let limbs = frame.limbs
                .filter { $0.energy > 0.05 && $0.root.inUnitSquare && $0.mid.inUnitSquare && $0.tip.inUnitSquare }
                .sorted { $0.energy > $1.energy }
                .prefix(preset.maxAnchors)
            for limb in limbs {
                guard !hidesBehindFace(limb.tip, pad: wrapAmplitude),
                      !hidesBehindFace(limb.mid, pad: wrapAmplitude),
                      let path = DisplayPath([limb.root, limb.mid, limb.tip], aspect: aspect) else { continue }
                let energy = fxClamp(limb.energy)
                // 止まっている腕はうっすら、振った腕はくっきり。0 にはしない
                // （出たり消えたりがチカチカして見えるので）。
                let lit = base*(0.55+0.45*energy)
                let amp = wrapAmplitude*shortToY*(0.70+0.50*energy)

                switch style {
                case "lightning":
                    // パチパチさせるため、コマごとに引き直す。time を刻んだものを
                    // 種にしているので、同じ時刻なら必ず同じ形になる（書き出しを
                    // やり直しても同じ絵）。
                    let tick = Int((time*boltPerSecond).rounded(.down))
                    let strands: [(phase: Double, weight: Double, turns: Double)] =
                        [(0, 1.0, 1.7), (Double.pi, 0.62, 2.3)]
                    for (index, s) in strands.enumerated() {
                        let pts = wrap(path, aspect: aspect, samples: 26, amplitude: amp*s.weight,
                                       turns: s.turns, phase: s.phase,
                                       jitter: boltJitter*shortToY*s.weight, seed: tick &+ index &* 7717)
                        scene.primitives.append(.init(kind: .glow, points: pts,
                                                      color: preset.color.opacity(lit*s.weight),
                                                      lineWidth: boltWidth*s.weight))
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
                            let drift = amp*0.5*(noise(tick &+ index &* 131, step)-0.5)
                            let d = FXPoint(p.x+n.x*out+dir.x*drift, p.y+n.y*out+dir.y*drift)
                            branch.append(FXPoint(d.x/aspect, d.y))
                        }
                        scene.primitives.append(.init(kind: .glow, points: branch,
                                                      color: preset.color.opacity(lit*0.75),
                                                      lineWidth: boltWidth*0.6))
                    }

                case "spiral":
                    // ぐるぐる回る帯。時間で位相を進めるので、腕が止まっていても
                    // かざりのほうは回り続ける。
                    let phase = time*spinPerSecond*2*Double.pi
                    // 手前側と奥側の2本。奥をうすく細くすると、腕に巻きついて
                    // 見える（1本だけだと ただの波線）。
                    for (offset, weight) in [(0.0, 1.0), (Double.pi, 0.42)] {
                        let pts = wrap(path, aspect: aspect, samples: 30, amplitude: amp,
                                       turns: 2.6, phase: phase+offset, jitter: 0, seed: 0)
                        scene.primitives.append(.init(kind: .glow, points: pts,
                                                      color: preset.color.opacity(lit*weight),
                                                      lineWidth: bandWidth*(weight == 1 ? 1 : 0.6)))
                    }

                case "aura":
                    // 腕そのものが太く光る（気をまとっている感じ）。ゆっくり脈打つ。
                    let pulse = 0.85+0.15*sin(time*5.5)
                    let pts = wrap(path, aspect: aspect, samples: 18, amplitude: amp*0.18,
                                   turns: 1.0, phase: time*1.6, jitter: 0, seed: 0)
                    scene.primitives.append(.init(kind: .glow, points: pts,
                                                  color: preset.color.opacity(lit*0.85*pulse),
                                                  lineWidth: auraWidth))
                default:
                    break
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
            let ballScale = style == "aura" ? 1.15 : 0.78
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
                    scene.primitives.append(.init(kind: .glow, points: trail.reversed(),
                                                  color: preset.color.opacity(lit*0.70),
                                                  lineWidth: bandWidth*(0.6+0.6*energy)))
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
                    scene.primitives.append(.init(kind: .glow, points: [
                        hit.point + .init(dx*inner, dy*inner),
                        hit.point + .init(dx*outer, dy*outer),
                    ], color: preset.color.opacity(base*fade*0.9), lineWidth: boltWidth*0.8))
                }
            }
        }

        // A hard budget prevents a future preset from becoming a particle storm.
        scene.primitives = Array(scene.primitives.prefix(16))
        return scene
    }

    /// 骨に沿って、左右にうねりながら進む折れ線を作る。
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

    /// 決まった答えを返す雑音（0...1）。乱数を使うと、書き出しをやり直すたびに
    /// 稲妻の形が変わってしまう（同じ動画から違う絵が出るのは避けたい）。
    private static func noise(_ a: Int, _ b: Int) -> Double {
        var h = UInt64(bitPattern: Int64(a &* 73856093 ^ b &* 19349663 ^ 0x5bf0_3635))
        h ^= h >> 33; h = h &* 0xff51_afd7_ed55_8ccd; h ^= h >> 33
        return Double(h % 10_007)/10_007
    }
}
