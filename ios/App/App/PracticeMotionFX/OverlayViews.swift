#if os(iOS)
import SwiftUI
import UIKit
import QuartzCore

public final class MotionOverlayView: UIView {
    public var scene: EffectScene = .init(sourceSize: .init(1,1)) { didSet { setNeedsDisplay() } }
    public var videoContentMode: FXContentMode = .fit { didSet { setNeedsDisplay() } }
    public var isVideoMirrored = false { didSet { setNeedsDisplay() } }
    private let catalog: EffectCatalog
    public init(catalog: EffectCatalog) {
        self.catalog = catalog; super.init(frame: .zero)
        isOpaque = false; backgroundColor = .clear; isUserInteractionEnabled = false
        accessibilityElementsHidden = true; contentMode = .redraw
    }
    required init?(coder: NSCoder) { return nil }
    public override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        EffectPainter.draw(scene,in: context,viewport: bounds.size,catalog: catalog,
                           mode: videoContentMode,mirrored: isVideoMirrored)
    }
}
public struct PracticeEffectsOverlay: UIViewRepresentable {
    public var scene: EffectScene
    public let catalog: EffectCatalog
    public var contentMode: FXContentMode
    public var mirrored: Bool
    public init(scene: EffectScene, catalog: EffectCatalog, contentMode: FXContentMode = .fit, mirrored: Bool = false) {
        self.scene = scene; self.catalog = catalog; self.contentMode = contentMode; self.mirrored = mirrored
    }
    public func makeUIView(context: Context) -> MotionOverlayView { MotionOverlayView(catalog: catalog) }
    public func updateUIView(_ view: MotionOverlayView, context: Context) {
        view.videoContentMode = contentMode; view.isVideoMirrored = mirrored; view.scene = scene
    }
}
@MainActor public final class LiveEffectsModel: ObservableObject {
    @Published public private(set) var latest: LiveTrackingUpdate?
    private var history: [EffectFrame] = []
    public init() {}
    public func receive(_ update: LiveTrackingUpdate) {
        if let old = latest, old.frame.generation != update.frame.generation || update.frame.time <= old.frame.time {
            history.removeAll()
        }
        history.append(update.frame)
        if history.count > 10 { history.removeFirst(history.count-10) }
        latest = update
    }
    public func clear() { latest = nil; history.removeAll() }
    public func scene(preset: EffectPreset, intensity: Double = 1, reduceMotion: Bool = false) -> EffectScene {
        guard let latest else { return .init(sourceSize: FXSize(1,1)) }
        // Include processing latency in effect age; never pretend old landmarks are current.
        let time = latest.frame.time+max(0,CACurrentMediaTime()-latest.acceptedHostTime)
        return SceneBuilder.make(frame: latest.frame,at: time,history: history,preset: preset,
                                 intensity: intensity,reduceMotion: reduceMotion)
    }
}
public struct LivePracticeEffectsOverlay: View {
    @ObservedObject private var model: LiveEffectsModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let catalog: EffectCatalog
    private let preset: EffectPreset
    private let contentMode: FXContentMode
    private let mirrored: Bool
    private let intensity: Double
    public init(model: LiveEffectsModel, catalog: EffectCatalog, preset: EffectPreset,
                contentMode: FXContentMode = .fill, mirrored: Bool = false, intensity: Double = 1) {
        self.model = model; self.catalog = catalog; self.preset = preset
        self.contentMode = contentMode; self.mirrored = mirrored; self.intensity = intensity
    }
    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0/30.0,paused: model.latest == nil || intensity <= 0)) { _ in
            PracticeEffectsOverlay(scene: model.scene(preset: preset,intensity: intensity,reduceMotion: reduceMotion),
                catalog: catalog,contentMode: contentMode,mirrored: mirrored)
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}
#endif
