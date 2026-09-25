import Foundation

public struct EffectTimeline: Codable, Sendable {
    public var schemaVersion: Int = 2
    public let sourceID: String
    public let mode: PracticeMode
    public let duration: Double
    public let frames: [EffectFrame]
    public init(sourceID: String, mode: PracticeMode, duration: Double, frames: [EffectFrame]) throws {
        self.sourceID = sourceID; self.mode = mode; self.duration = duration; self.frames = frames
        try validate()
    }
    public func validate() throws {
        // 2 = 腕／脚の骨（limbs）が入っている。1 の解析結果は読まずに取り直す
        // （骨が無いと、腕に巻きつくかざりが黙って出なくなる）。
        guard schemaVersion == 2, duration.isFinite, duration > 0, duration <= 3600,
              !sourceID.isEmpty, frames.count <= 108_001 else { throw FXError.invalidData("Invalid timeline metadata or size.") }
        var last = -Double.infinity
        for f in frames {
            guard f.time.isFinite, f.time >= 0, f.time <= duration+0.1, f.time > last,
                  f.sourceSize.isValid, f.anchors.count <= 4,
                  Set(f.anchors.map(\.joint)).count == f.anchors.count else { throw FXError.invalidData("Invalid or unsorted timeline frames.") }
            for a in f.anchors {
                guard a.point.inUnitSquare, a.velocity.isFinite, (0...1).contains(a.energy), (0...1).contains(a.confidence),
                      a.lastBurst.map({ $0.isFinite && $0 >= 0 && $0 <= f.time+0.001 }) ?? true else {
                    throw FXError.invalidData("Invalid anchor values.")
                }
            }
            guard f.limbs.count <= 4 else { throw FXError.invalidData("Too many limbs in a frame.") }
            for l in f.limbs {
                guard l.root.inUnitSquare, l.mid.inUnitSquare, l.tip.inUnitSquare,
                      (0...1).contains(l.energy) else { throw FXError.invalidData("Invalid limb values.") }
            }
            last = f.time
        }
    }
    public func save(to url: URL) throws {
        try validate()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(self).write(to: url, options: .atomic)
    }
    public static func load(from url: URL) throws -> Self {
        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        guard (values.fileSize ?? 0) <= 64*1024*1024 else { throw FXError.invalidData("Timeline exceeds the 64 MB safety limit.") }
        let t = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url)); try t.validate(); return t
    }
    /// Binary search: no scan of the complete recording on each video frame.
    public func precedingIndex(at time: Double) -> Int? {
        guard time.isFinite, !frames.isEmpty, time >= frames[0].time, time <= duration+0.001 else { return nil }
        var low = 0, high = frames.count
        while low < high {
            let mid = (low+high)/2
            if frames[mid].time <= time { low = mid+1 } else { high = mid }
        }
        return low-1
    }
    public func scene(at time: Double, preset: EffectPreset, intensity: Double = 1,
                      reduceMotion: Bool = false) -> EffectScene {
        let size = frames.first?.sourceSize ?? FXSize(1,1)
        guard preset.mode == mode, let i = precedingIndex(at: time) else { return .init(sourceSize: size) }
        var current = frames[i]
        if i+1 < frames.count {
            let next = frames[i+1], gap = next.time-current.time
            if gap > 0, gap <= 0.20, next.generation == current.generation {
                let mix = fxClamp((time-current.time)/gap)
                // 骨も補間する。ここを飛ばすと、稲妻だけ解析の 15fps でカクつく。
                current.limbs = current.limbs.map { l in
                    guard let b = next.limbs.first(where: { $0.joint == l.joint }),
                          l.tip.distance(to: b.tip, aspect: size.aspect) < 0.20 else { return l }
                    var x = l
                    x.root = l.root.mixed(with: b.root, amount: mix)
                    x.mid = l.mid.mixed(with: b.mid, amount: mix)
                    x.tip = l.tip.mixed(with: b.tip, amount: mix)
                    x.energy = l.energy+(b.energy-l.energy)*mix
                    return x
                }
                current.anchors = current.anchors.map { a in
                    guard let b = next.anchors.first(where: { $0.joint == a.joint }),
                          a.point.distance(to: b.point, aspect: size.aspect) < 0.20 else { return a }
                    var x = a
                    x.point = a.point.mixed(with: b.point, amount: mix)
                    x.energy = a.energy+(b.energy-a.energy)*mix
                    // Keep the earlier event timestamp: never show a burst before it occurs.
                    return x
                }
                // Interpolation has a valid source on both sides; don't fade valid low-FPS data.
                current.time = time
            }
        }
        return SceneBuilder.make(frame: current, at: time, history: Array(frames[max(0,i-6)...i]),
                                 preset: preset, intensity: intensity, reduceMotion: reduceMotion)
    }
}

/// Admission control is independent of video recording. A rejected tracking frame MUST still be recorded.
public struct TrackingBudget: Sendable {
    public enum Pressure: Sendable { case nominal, fair, serious, critical }
    public var targetFPS: Double
    public private(set) var measuredMilliseconds: Double = 0
    public init(targetFPS: Double) { self.targetFPS = fxClamp(targetFPS,1,30) }
    public mutating func observe(milliseconds: Double) {
        guard milliseconds.isFinite, milliseconds >= 0 else { return }
        measuredMilliseconds = measuredMilliseconds == 0 ? milliseconds : measuredMilliseconds*0.85+milliseconds*0.15
    }
    public func effectiveFPS(pressure: Pressure, lowPower: Bool) -> Double {
        if pressure == .critical { return 0 }
        let cap: Double = pressure == .serious ? 5 : (pressure == .fair || lowPower ? 8 : targetFPS)
        // Aim for <= 55% serial tracking duty cycle; this is a control policy, not a measured device claim.
        let latencyCap = measuredMilliseconds > 0 ? 550/measuredMilliseconds : targetFPS
        return min(targetFPS, cap, max(2, latencyCap))
    }
}
