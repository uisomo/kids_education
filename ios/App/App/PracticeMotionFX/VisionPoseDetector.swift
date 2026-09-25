#if os(iOS)
import Foundation
import Vision
import CoreVideo
import ImageIO

/// Serial-use adapter. Observations are estimates; IDs below are spatial continuity, not person identity.
final class VisionPoseDetector {
    private let configuration: TrackingConfiguration
    private let body = VNDetectHumanBodyPoseRequest()
    private let hand = VNDetectHumanHandPoseRequest()
    private var generation = 0
    private var center: FXPoint?
    private var lastBodyTime = -Double.infinity
    private var handSlots: [Int: (point: FXPoint, time: Double)] = [:]
    init(configuration: TrackingConfiguration) {
        self.configuration = configuration.normalized; hand.maximumHandCount = 2
    }
    func reset() { generation += 1; center = nil; handSlots.removeAll(); lastBodyTime = -.infinity }
    func process(_ buffer: CVPixelBuffer, time: Double, sourceSize: FXSize) throws -> PoseFrame {
        let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
        if configuration.mode == .karate {
            try handler.perform([body])
            return try bodyFrame(body.results ?? [], time: time, sourceSize: sourceSize)
        } else {
            try handler.perform([hand])
            return try handFrame(hand.results ?? [], time: time, sourceSize: sourceSize)
        }
    }
    private func tracked(_ p: VNRecognizedPoint) -> FXTrackedPoint? {
        let result = FXTrackedPoint(.init(Double(p.location.x), 1-Double(p.location.y)), confidence: Double(p.confidence))
        return result.point.inUnitSquare && result.confidence >= configuration.minimumConfidence ? result : nil
    }
    private func bodyFrame(_ observations: [VNHumanBodyPoseObservation], time: Double, sourceSize: FXSize) throws -> PoseFrame {
        let map: [(VNHumanBodyPoseObservation.JointName, FXJoint)] = [
            (.nose,.nose),(.neck,.neck),(.root,.root),(.leftEye,.leftEye),(.rightEye,.rightEye),
            (.leftEar,.leftEar),(.rightEar,.rightEar),(.leftShoulder,.leftShoulder),(.rightShoulder,.rightShoulder),
            (.leftElbow,.leftElbow),(.rightElbow,.rightElbow),(.leftWrist,.leftWrist),(.rightWrist,.rightWrist),
            (.leftHip,.leftHip),(.rightHip,.rightHip),(.leftKnee,.leftKnee),(.rightKnee,.rightKnee),
            (.leftAnkle,.leftAnkle),(.rightAnkle,.rightAnkle)
        ]
        var candidates: [(center: FXPoint, joints: [FXJoint: FXTrackedPoint])] = []
        for observation in observations {
            let recognized = try observation.recognizedPoints(.all)
            var joints: [FXJoint: FXTrackedPoint] = [:]
            for (key,joint) in map { if let p = recognized[key], let value = tracked(p) { joints[joint] = value } }
            guard joints.count >= 4 else { continue }
            let c: FXPoint
            if let neck = joints[.neck]?.point, let root = joints[.root]?.point { c = (neck+root)*0.5 }
            else if let root = joints[.root]?.point { c = root }
            else if let neck = joints[.neck]?.point { c = neck }
            else { continue }
            if let region = configuration.subjectRegion, !region.contains(c) { continue }
            candidates.append((c,joints))
        }
        var selected: (center: FXPoint, joints: [FXJoint: FXTrackedPoint])?
        if let previous = center, time-lastBodyTime <= 0.65 {
            let nearby = candidates.sorted { $0.center.distance(to: previous, aspect: sourceSize.aspect) < $1.center.distance(to: previous, aspect: sourceSize.aspect) }
            if let first = nearby.first,
               first.center.distance(to: previous, aspect: sourceSize.aspect) < 0.18 {
                // Hide rather than choose when two people crowd the current subject's center.
                if nearby.count < 2 || abs(nearby[1].center.distance(to: previous, aspect: sourceSize.aspect)-first.center.distance(to: previous, aspect: sourceSize.aspect)) > 0.04 {
                    selected = first
                }
            }
        } else if candidates.count == 1 {
            selected = candidates[0]; generation += 1
        }
        if let selected = selected { center = selected.center; lastBodyTime = time }
        return PoseFrame(time: time, sourceSize: sourceSize, generation: generation, joints: selected?.joints ?? [:])
    }
    private func handFrame(_ observations: [VNHumanHandPoseObservation], time: Double, sourceSize: FXSize) throws -> PoseFrame {
        var anchors: [FXTrackedPoint] = []
        for observation in observations {
            let all = try observation.recognizedPoints(.all)
            guard let rawWrist = all[.wrist], let wrist = tracked(rawWrist) else { continue }
            let mcp: [VNHumanHandPoseObservation.JointName] = [.indexMCP,.middleMCP,.ringMCP,.littleMCP]
            let bases = mcp.compactMap { all[$0] }.compactMap { tracked($0) }
            guard bases.count >= 2 else { continue }
            let average = bases.reduce(FXPoint.zero) { $0+$1.point }*(1/Double(bases.count))
            let p = wrist.point*0.75+average*0.25
            if let region = configuration.subjectRegion, !region.contains(p) { continue }
            anchors.append(FXTrackedPoint(p, confidence: min(wrist.confidence, bases.map(\.confidence).min() ?? 0)))
        }
        // Side-view overlapping hands are ambiguous. Do not draw confidently through the occlusion.
        if anchors.count == 2 && anchors[0].point.distance(to: anchors[1].point, aspect: sourceSize.aspect) < 0.035 {
            anchors.removeAll()
        }
        handSlots = handSlots.filter { time-$0.value.time <= 0.22 }
        var assignments: [Int: FXTrackedPoint] = [:]
        var remaining = Array(anchors.indices)
        // Two-hand global assignment avoids the common "Vision result order swapped" jump.
        if anchors.count == 2, let a = handSlots[0], let b = handSlots[1] {
            let straight = a.point.distance(to: anchors[0].point, aspect: sourceSize.aspect)+b.point.distance(to: anchors[1].point, aspect: sourceSize.aspect)
            let crossed = a.point.distance(to: anchors[1].point, aspect: sourceSize.aspect)+b.point.distance(to: anchors[0].point, aspect: sourceSize.aspect)
            let order = straight <= crossed ? [0,1] : [1,0]
            if abs(straight-crossed) > 0.015 {
                for slot in 0...1 {
                    if handSlots[slot]!.point.distance(to: anchors[order[slot]].point, aspect: sourceSize.aspect) <= 0.18 {
                        assignments[slot] = anchors[order[slot]]; remaining.removeAll { $0 == order[slot] }
                    }
                }
            } else { remaining.removeAll() }
        } else {
            for slot in handSlots.keys.sorted() {
                guard let previous = handSlots[slot], let match = remaining.min(by: {
                    anchors[$0].point.distance(to: previous.point, aspect: sourceSize.aspect) < anchors[$1].point.distance(to: previous.point, aspect: sourceSize.aspect)
                }), anchors[match].point.distance(to: previous.point, aspect: sourceSize.aspect) <= 0.18 else { continue }
                assignments[slot] = anchors[match]; remaining.removeAll { $0 == match }
            }
        }
        // New hands take genuinely unoccupied slots. Existing missing slots are not stolen immediately.
        for index in remaining.sorted(by: { anchors[$0].point.x < anchors[$1].point.x }) {
            guard let slot = (0...1).first(where: { assignments[$0] == nil && handSlots[$0] == nil }) else { continue }
            assignments[slot] = anchors[index]
        }
        var joints: [FXJoint: FXTrackedPoint] = [:]
        for (slot,value) in assignments {
            handSlots[slot] = (value.point,time)
            joints[slot == 0 ? .hand0 : .hand1] = value
        }
        return PoseFrame(time: time, sourceSize: sourceSize, generation: generation, joints: joints)
    }
}
#endif
