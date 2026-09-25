import Foundation

public enum PracticeMode: String, Codable, Sendable { case karate, piano }
public enum FXJoint: String, Codable, CaseIterable, Sendable {
    case nose, neck, root, leftEye, rightEye, leftEar, rightEar
    case leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist
    case leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle
    /// Stable spatial slots, NOT anatomical left/right hand labels.
    case hand0, hand1
    public var isFoot: Bool { self == .leftAnkle || self == .rightAnkle }
    public var isHandSlot: Bool { self == .hand0 || self == .hand1 }
}
public struct FXTrackedPoint: Codable, Sendable, Equatable {
    public var point: FXPoint; public var confidence: Double
    public init(_ point: FXPoint, confidence: Double = 1) { self.point = point; self.confidence = confidence }
}
public struct PoseFrame: Codable, Sendable {
    public var time: Double; public var sourceSize: FXSize; public var generation: Int
    public var joints: [FXJoint: FXTrackedPoint]
    public init(time: Double, sourceSize: FXSize, generation: Int = 0, joints: [FXJoint: FXTrackedPoint]) {
        self.time = time; self.sourceSize = sourceSize; self.generation = generation; self.joints = joints
    }
}
public struct AnchorFrame: Codable, Sendable, Equatable {
    public var joint: FXJoint; public var point: FXPoint; public var velocity: FXPoint
    public var energy: Double; public var confidence: Double; public var lastBurst: Double?
    public init(joint: FXJoint, point: FXPoint, velocity: FXPoint = .zero, energy: Double = 0,
                confidence: Double = 1, lastBurst: Double? = nil) {
        self.joint = joint; self.point = point; self.velocity = velocity
        self.energy = energy; self.confidence = confidence; self.lastBurst = lastBurst
    }
}
public struct EffectFrame: Codable, Sendable, Equatable {
    public var time: Double; public var generation: Int; public var sourceSize: FXSize
    public var anchors: [AnchorFrame]; public var headExclusion: FXRect?
    public init(time: Double, generation: Int = 0, sourceSize: FXSize,
                anchors: [AnchorFrame] = [], headExclusion: FXRect? = nil) {
        self.time = time; self.generation = generation; self.sourceSize = sourceSize
        self.anchors = anchors; self.headExclusion = headExclusion
    }
}
public struct TrackingConfiguration: Codable, Sendable {
    public var mode: PracticeMode
    public var framesPerSecond: Double
    public var longestAnalysisEdge: Int
    public var minimumConfidence: Double
    /// Manual upright normalized region for person/hand selection. NOT a Vision image crop.
    public var subjectRegion: FXRect?
    public init(mode: PracticeMode, framesPerSecond: Double? = nil,
                longestAnalysisEdge: Int? = nil, minimumConfidence: Double? = nil,
                subjectRegion: FXRect? = nil) {
        self.mode = mode
        self.framesPerSecond = fxClamp(framesPerSecond ?? (mode == .karate ? 15 : 12), 1, 30)
        self.longestAnalysisEdge = min(1280, max(320, longestAnalysisEdge ?? (mode == .karate ? 640 : 768)))
        self.minimumConfidence = fxClamp(minimumConfidence ?? (mode == .karate ? 0.45 : 0.55), 0.2, 0.95)
        if let r = subjectRegion, [r.x,r.y,r.width,r.height].allSatisfy(\.isFinite), r.width > 0, r.height > 0 {
            self.subjectRegion = r
        } else { self.subjectRegion = nil }
    }
    public var normalized: Self {
        .init(mode: mode,framesPerSecond: framesPerSecond,longestAnalysisEdge: longestAnalysisEdge,
              minimumConfidence: minimumConfidence,subjectRegion: subjectRegion)
    }
}
public enum FXError: Error, LocalizedError {
    case invalidData(String), unsupported(String), cancelled, assetMissing
    public var errorDescription: String? {
        switch self {
        case .invalidData(let s), .unsupported(let s): return s
        case .cancelled: return "The operation was cancelled. The original video was not modified."
        case .assetMissing: return "Bundled motion-effect resources are missing. Add the Swift package, not only its Swift files."
        }
    }
}
