import Foundation

/// Decorative motion heuristics, not a trained action classifier or technique evaluator.
/// One instance per stream. Call serially; do not share across camera/video jobs.
public final class MotionEngine {
    public let configuration: TrackingConfiguration
    private struct State {
        var raw: FXPoint; var smoothed: FXPoint; var relative: FXPoint; var time: Double
        var velocity: FXPoint = .zero; var lastBurst: Double?; var armed = true
    }
    /// 支えの無い点（肩・肘／尻・膝 が取れていない関節）に求める信頼度。
    ///
    /// 実写で測って足した: 画面の外にある足首を Vision が **推測して**、焼き込んだ
    /// アランの絵の上に置いていた（`rightAnkle(0.74,0.92) 信頼度0.50
    /// エネルギー1.00` — 動いているのではなく、毎コマ飛び回っていただけ）。
    /// そこに衝撃波が出て、キツネが技を決めているように見えた。
    ///
    /// となりの関節が裏づけている点は今までどおり通す（カメラに向かって
    /// まっすぐ突くと肘や肩が消えるので、そこを厳しくすると突きが死ぬ）。
    private static let unsupportedConfidence = 0.62

    private var states: [FXJoint: State] = [:]
    private var previousTime: Double?; private var generation: Int?
    public init(configuration: TrackingConfiguration) { self.configuration = configuration.normalized }
    public func reset() { states.removeAll(); previousTime = nil; generation = nil }
    public func process(_ pose: PoseFrame) -> EffectFrame {
        var output = EffectFrame(time: pose.time.isFinite ? pose.time : 0,
                                 generation: pose.generation, sourceSize: pose.sourceSize)
        guard pose.time.isFinite, pose.time >= 0, pose.sourceSize.isValid else { reset(); return output }
        if generation != pose.generation { reset(); generation = pose.generation }
        if let t = previousTime, pose.time <= t { return output } // Ignore duplicate/out-of-order samples.
        if let t = previousTime, pose.time-t > 0.3 { states.removeAll() }
        previousTime = pose.time
        let aspect = pose.sourceSize.aspect
        func point(_ joint: FXJoint) -> FXTrackedPoint? {
            guard let p = pose.joints[joint], p.point.inUnitSquare,
                  (0...1).contains(p.confidence), p.confidence >= configuration.minimumConfidence else { return nil }
            return p
        }
        var scale = 0.25
        if let n = point(.neck), let r = point(.root) {
            scale = fxClamp(n.point.distance(to: r.point, aspect: aspect), 0.10, 0.65)
        } else if let l = point(.leftShoulder), let r = point(.rightShoulder) {
            scale = fxClamp(l.point.distance(to: r.point, aspect: aspect)*1.2, 0.10, 0.65)
        }
        if let nose = point(.nose) {
            let ry = scale*0.39, rx = ry/aspect
            output.headExclusion = FXRect(x: nose.point.x-rx, y: nose.point.y-ry,
                                          width: rx*2, height: ry*2)
        }
        if output.headExclusion == nil, let neck = point(.neck) {
            let w = scale*0.72/aspect, h = scale*0.72
            output.headExclusion = FXRect(x: neck.point.x-w/2,y: neck.point.y-h,width: w,height: h)
        }
        let selected: [FXJoint] = configuration.mode == .karate ?
            [.leftWrist, .rightWrist, .leftAnkle, .rightAnkle] : [.hand0, .hand1]
        var present = Set<FXJoint>()
        for joint in selected {
            guard let sample = point(joint) else { continue }
            present.insert(joint)
            let root: FXJoint
            let middle: FXJoint
            switch joint {
            case .leftWrist: root = .leftShoulder; middle = .leftElbow
            case .rightWrist: root = .rightShoulder; middle = .rightElbow
            case .leftAnkle: root = .leftHip; middle = .leftKnee
            case .rightAnkle: root = .rightHip; middle = .rightKnee
            default: root = joint; middle = joint
            }
            // 裏づけの無い点は、それだけでは信じない（上の unsupportedConfidence）。
            if !joint.isHandSlot, point(root) == nil || point(middle) == nil,
               sample.confidence < Self.unsupportedConfidence {
                states.removeValue(forKey: joint)
                continue
            }
            let base = joint.isHandSlot ? FXPoint.zero : (point(root)?.point ?? sample.point)
            let relative = sample.point-base
            guard var state = states[joint] else {
                states[joint] = State(raw: sample.point, smoothed: sample.point, relative: relative, time: pose.time)
                output.anchors.append(.init(joint: joint, point: sample.point, confidence: sample.confidence))
                continue
            }
            let dt = pose.time-state.time
            // Reject implausible landmark teleportation; re-acquire without a burst or a connecting trail.
            if dt <= 0 || dt > 0.25 || sample.point.distance(to: state.raw, aspect: aspect) > max(0.20, dt*3.5) {
                states.removeValue(forKey: joint)
                continue
            }
            let rawVelocity = (sample.point-state.raw)*(1/dt)
            let relativeSpeed = ((relative-state.relative)*(1/dt)).length(aspect: aspect)
            let speed = relativeSpeed/(joint.isHandSlot ? 0.20 : scale)
            let tau = fxClamp(0.065/(1+speed*0.8), 0.014, 0.065)
            let alpha = 1-exp(-dt/tau)
            let smooth = state.smoothed.mixed(with: sample.point, amount: alpha)
            state.velocity = state.velocity.mixed(with: rawVelocity, amount: 1-exp(-dt/0.05))
            let energy = fxClamp((speed-(joint.isHandSlot ? 0.06 : 0.15))/(joint.isHandSlot ? 1.4 : 3.8))
            let radialSpeed = (relative.length(aspect: aspect)-state.relative.length(aspect: aspect))/dt/scale
            if speed < 0.65 || (!joint.isHandSlot && radialSpeed < -0.3) { state.armed = true }
            let cooldown = joint.isHandSlot ? 0.60 : 0.25
            let cooled = state.lastBurst.map { pose.time-$0 >= cooldown } ?? true
            var shouldBurst = false
            if joint.isHandSlot {
                shouldBurst = speed > 0.35 && energy > 0.10
            } else if let a = point(root)?.point, let b = point(middle)?.point {
                let chain = a.distance(to: b, aspect: aspect)+b.distance(to: sample.point, aspect: aspect)
                let extensionRatio = a.distance(to: sample.point, aspect: aspect)/max(chain, 0.0001)
                // Measured on real practice footage: the upstream 2.2 / 0.6 / 0.72 gate never fired
                // once in 32s of punching, because a punch toward the lens is foreshortened in 2D.
                shouldBurst = speed > (joint.isFoot ? 1.1 : 1.2) && radialSpeed > 0.2 && extensionRatio > 0.35
            } else {
                // Elbow or shoulder missing: speed alone, so a straight punch still sparks.
                shouldBurst = speed > 1.3 && energy > 0.25
            }
            if shouldBurst && cooled && (joint.isHandSlot || state.armed) {
                state.lastBurst = pose.time; state.armed = false
            }
            output.anchors.append(.init(joint: joint, point: smooth, velocity: state.velocity,
                                        energy: energy, confidence: sample.confidence, lastBurst: state.lastBurst))
            // 腕／脚の骨。肩と肘が取れたコマだけ。かざりを腕に巻きつけるのに使う。
            if !joint.isHandSlot, let r = point(root)?.point, let m = point(middle)?.point,
               r.inUnitSquare, m.inUnitSquare {
                output.limbs.append(.init(kind: joint.isFoot ? .leg : .arm, joint: joint,
                                          root: r, mid: m, tip: smooth, energy: energy))
            }
            state.raw = sample.point; state.smoothed = smooth; state.relative = relative; state.time = pose.time
            states[joint] = state
        }
        // Missing anchors disappear, rather than snapping to zero or drifting across the child.
        states = states.filter { present.contains($0.key) }
        return output
    }
}
