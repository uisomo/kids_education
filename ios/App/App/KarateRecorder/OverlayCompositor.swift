@preconcurrency import AVFoundation
import CoreText
import UIKit

/// Burns the training overlay (種目名 / countdown / 掛け声 / 工夫メモ) into a
/// recorded video using AVFoundation's Core Animation compositing, replacing
/// the ffmpeg.wasm pass used by the web build.
///
/// The web burn-in built one PNG and one chained ffmpeg `overlay` filter per
/// overlay event, and the countdown emits one event per second — a 5 minute
/// session produced ~300 filter links, which single-threaded ffmpeg.wasm in
/// WKWebView could not complete. Here the same event log collapses into one
/// CALayer per distinct (region, text) pair, each carrying a discrete opacity
/// keyframe animation that switches it on for every window where that exact
/// text is showing. A 5 minute session needs roughly as many layers as the
/// longest drill has seconds, not one per second of the whole session.
enum OverlayCompositor {

    // MARK: - Overlay model

    /// One overlay region. Layout mirrors overlay-frame-render.ts so the burned
    /// video matches what the web build drew.
    enum Region: String, CaseIterable {
        case drill, seconds, cue, caption, intro
    }

    /// One row of the 特訓一覧 panel.
    struct MenuItem {
        var name: String
        var seconds: Int
        var isRest: Bool
        /// 強さ level before this practice (saved menus only), 0...10.
        var level: Int? = nil
        /// This row's drill finished, so it earns one more bar once it's done.
        var gained = false
    }

    /// Red → purple, matching the 強さ screen's bars.
    private static let rainbow: [UIColor] = [
        rgb(0xff3b30), rgb(0xff6b22), rgb(0xff9f0a), rgb(0xffd60a), rgb(0x34c759),
        rgb(0x30c0c6), rgb(0x32ade6), rgb(0x5b6cff), rgb(0x8e5bff), rgb(0xbf5af2),
    ]

    private static func rgb(_ hex: Int) -> UIColor {
        let r = CGFloat((hex >> 16) & 0xff) / 255
        let g = CGFloat((hex >> 8) & 0xff) / 255
        let b = CGFloat(hex & 0xff) / 255
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }

    struct State: Equatable {
        var drill = ""
        var seconds = 0
        var cue = ""
        var caption = ""
        var intro = ""
        /// Menu position of the drill now running; -1 before the first drill.
        var drillIndex = -1

        func text(for region: Region) -> String {
            switch region {
            case .drill: return drill
            case .seconds: return seconds > 0 ? String(seconds) : ""
            case .cue: return cue
            case .caption: return caption
            case .intro: return intro
            }
        }
    }

    struct Event {
        var t: Double          // ms since recording start
        var patch: [String: Any]
    }

    struct Segment {
        var state: State
        var startMs: Double
        var endMs: Double
    }

    /// Design-space geometry, matching overlay-frame-render.ts's 720x1280
    /// canvas. Positions are scaled to the real video size at render time, so
    /// unlike the web version this adapts to whatever resolution the camera
    /// actually produced instead of assuming portrait 720x1280.
    private struct Style {
        var centerX: CGFloat       // fraction of width
        var centerY: CGFloat       // fraction of height, measured from the TOP
        var fontPx: CGFloat        // in 1280-tall design space
        var color: UIColor
        var background: UIColor
        /// Draw only the text, with a dark outline and shadow, and no box behind
        /// it — used for the countdowns so they don't cover the child.
        var outlined = false
    }

    private static let designWidth: CGFloat = 720
    private static let designHeight: CGFloat = 1280

    private static func style(for region: Region) -> Style {
        switch region {
        case .drill:
            return Style(centerX: 0.5, centerY: 90 / designHeight, fontPx: 44,
                         color: .white,
                         background: UIColor(white: 0, alpha: 0.6))
        case .seconds:
            return Style(centerX: 0.5, centerY: 230 / designHeight, fontPx: 150,
                         color: UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1),
                         background: UIColor(white: 0, alpha: 0.55), outlined: true)
        case .cue:
            return Style(centerX: 0.5, centerY: 0.5, fontPx: 72,
                         color: UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1),
                         background: UIColor(red: 214 / 255, green: 48 / 255, blue: 49 / 255, alpha: 0.85))
        case .caption:
            return Style(centerX: 0.5, centerY: (designHeight - 90) / designHeight, fontPx: 34,
                         color: UIColor(red: 0x1a / 255, green: 0x16 / 255, blue: 0x2b / 255, alpha: 1),
                         background: UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 0.92))
        case .intro:
            return Style(centerX: 0.5, centerY: 0.5, fontPx: 200,
                         color: UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1),
                         background: UIColor(white: 0, alpha: 0.55), outlined: true)
        }
    }

    /// "Go!!" gets the red cue styling so the start moment stands out.
    private static func style(for region: Region, text: String) -> Style {
        var s = style(for: region)
        if region == .intro, text.hasPrefix("Go") {
            // No red box any more, so the red goes into the text itself.
            s.color = UIColor(red: 1, green: 0x47 / 255, blue: 0x57 / 255, alpha: 1)
        }
        return s
    }

    // MARK: - Event log -> segments

    /// Mirrors toSegments() in overlay-burner.ts: each event patches the running
    /// state and owns the window until the next event.
    static func segments(from events: [Event], totalDurationMs: Double) -> [Segment] {
        guard !events.isEmpty else { return [] }
        var out: [Segment] = []
        var state = State()
        for (i, event) in events.enumerated() {
            if let v = event.patch["drill"] as? String { state.drill = v }
            if let v = event.patch["seconds"] as? NSNumber { state.seconds = v.intValue }
            if let v = event.patch["cue"] as? String { state.cue = v }
            if let v = event.patch["caption"] as? String { state.caption = v }
            if let v = event.patch["intro"] as? String { state.intro = v }
            if let v = event.patch["drillIndex"] as? NSNumber { state.drillIndex = v.intValue }
            let start = event.t
            let end = i + 1 < events.count ? events[i + 1].t : totalDurationMs
            if end > start { out.append(Segment(state: state, startMs: start, endMs: end)) }
        }
        return out
    }

    /// All windows during which `region` displays exactly `text`, merged so
    /// that consecutive segments carrying the same text become one window.
    /// This is what keeps the layer count bounded.
    private static func windows(
        in segments: [Segment], region: Region
    ) -> [String: [(start: Double, end: Double)]] {
        var byText: [String: [(start: Double, end: Double)]] = [:]
        for segment in segments {
            let text = segment.state.text(for: region)
            guard !text.isEmpty else { continue }
            var list = byText[text] ?? []
            if let last = list.last, abs(last.end - segment.startMs) < 1 {
                list[list.count - 1].end = segment.endMs   // contiguous: extend
            } else {
                list.append((start: segment.startMs, end: segment.endMs))
            }
            byText[text] = list
        }
        return byText
    }

    // MARK: - Layer construction

    /// A rounded "pill" plus centred text, matching drawLabel() in
    /// overlay-frame-render.ts, drawn into a bitmap with UIKit.
    ///
    /// Not a CATextLayer: AVVideoCompositionCoreAnimationTool renders the layer
    /// tree offscreen with no display pass, so CATextLayer never drew its text —
    /// exported videos had the pill backgrounds and no characters at all. A
    /// layer whose contents is a finished image has nothing left to draw.
    private static func labelLayer(
        text: String, style: Style, renderSize: CGSize
    ) -> CALayer {
        // Scale the 720x1280 design space onto the real video. Font scales by
        // the smaller ratio so text never overflows a narrower frame.
        let scaleX = renderSize.width / designWidth
        let scaleY = renderSize.height / designHeight
        let fontScale = min(scaleX, scaleY)
        let fontSize = style.fontPx * fontScale

        let font = UIFont(name: "HiraginoSans-W8", size: fontSize)
            ?? UIFont.systemFont(ofSize: fontSize, weight: .black)
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: style.color,
        ]
        if style.outlined {
            // Without a box, a dark outline and soft shadow keep the digits
            // readable over any background. Negative width = fill and stroke.
            let shadow = NSShadow()
            shadow.shadowColor = UIColor(white: 0, alpha: 0.6)
            shadow.shadowBlurRadius = fontSize * 0.08
            shadow.shadowOffset = CGSize(width: 0, height: fontSize * 0.02)
            attributes[.strokeColor] = UIColor(white: 0, alpha: 0.85)
            attributes[.strokeWidth] = -8
            attributes[.shadow] = shadow
        }
        let attributed = NSAttributedString(string: text, attributes: attributes)
        let textSize = attributed.size()

        let padX = fontSize * 0.5
        let padY = fontSize * 0.35
        let boxW = ceil(textSize.width + padX * 2)
        let boxH = ceil(fontSize + padY * 2)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1          // renderSize is already in video pixels
        format.opaque = false
        let image = UIGraphicsImageRenderer(
            size: CGSize(width: boxW, height: boxH), format: format
        ).image { _ in
            if !style.outlined {
                style.background.setFill()
                UIBezierPath(
                    roundedRect: CGRect(x: 0, y: 0, width: boxW, height: boxH),
                    cornerRadius: fontSize * 0.3
                ).fill()
            }
            attributed.draw(at: CGPoint(
                x: (boxW - textSize.width) / 2,
                y: (boxH - textSize.height) / 2
            ))
        }

        // Core Animation's origin is bottom-left here, but the design
        // coordinates are measured from the top, so flip Y.
        let centerX = style.centerX * renderSize.width
        let centerY = renderSize.height - style.centerY * renderSize.height

        let layer = CALayer()
        layer.frame = CGRect(x: centerX - boxW / 2, y: centerY - boxH / 2, width: boxW, height: boxH)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    /// Windows during which each drill is the highlighted row, merged like the
    /// text windows so one bitmap per row covers the whole session.
    private static func menuWindows(
        in segments: [Segment]
    ) -> [Int: [(start: Double, end: Double)]] {
        var byIndex: [Int: [(start: Double, end: Double)]] = [:]
        for segment in segments {
            let key = segment.state.drillIndex
            var list = byIndex[key] ?? []
            if let last = list.last, abs(last.end - segment.startMs) < 1 {
                list[list.count - 1].end = segment.endMs
            } else {
                list.append((start: segment.startMs, end: segment.endMs))
            }
            byIndex[key] = list
        }
        return byIndex
    }

    /// The whole session's menu with each drill's length in seconds, so anyone
    /// watching the video can follow the practice. The running drill is
    /// highlighted, finished ones are dimmed. Anchored bottom-left above the
    /// 工夫 caption, over the body rather than the face.
    private static func menuPanelLayer(
        menu: [MenuItem], activeIndex: Int, renderSize: CGSize
    ) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let pad = 14 * scale
        let titleH = 40 * scale
        // Long menus shrink their rows rather than running up over the face.
        let rowH = min(34 * scale, 460 * scale / CGFloat(max(menu.count, 1)))
        // Rows with a 強さ level get 10 small bars, so the panel is a bit wider.
        let showLevels = menu.contains { $0.level != nil }
        let width = (showLevels ? 350 : 300) * scale
        let height = ceil(pad + titleH + rowH * CGFloat(menu.count) + pad)

        let yellow = UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1)
        let titleFont = UIFont(name: "HiraginoSans-W8", size: 26 * scale)
            ?? UIFont.systemFont(ofSize: 26 * scale, weight: .heavy)
        let rowFont = UIFont(name: "HiraginoSans-W6", size: rowH * 0.66)
            ?? UIFont.systemFont(ofSize: rowH * 0.66, weight: .bold)

        let rightAligned = NSMutableParagraphStyle()
        rightAligned.alignment = .right
        let truncating = NSMutableParagraphStyle()
        truncating.lineBreakMode = .byTruncatingTail

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height), format: format
        ).image { _ in
            UIColor(white: 0, alpha: 0.5).setFill()
            UIBezierPath(
                roundedRect: CGRect(x: 0, y: 0, width: width, height: height),
                cornerRadius: 16 * scale
            ).fill()

            NSAttributedString(string: "特訓一覧", attributes: [
                .font: titleFont, .foregroundColor: yellow,
            ]).draw(at: CGPoint(x: pad, y: pad))

            for (i, item) in menu.enumerated() {
                let rowY = pad + titleH + CGFloat(i) * rowH
                let color: UIColor
                if i == activeIndex {
                    yellow.withAlphaComponent(0.22).setFill()
                    UIBezierPath(
                        roundedRect: CGRect(x: pad * 0.5, y: rowY, width: width - pad, height: rowH),
                        cornerRadius: 8 * scale
                    ).fill()
                    color = yellow
                } else if activeIndex >= 0, i < activeIndex {
                    color = UIColor(white: 1, alpha: 0.5)
                } else {
                    color = UIColor(white: 1, alpha: 0.92)
                }

                let textY = rowY + (rowH - rowFont.lineHeight) / 2
                let seconds = NSAttributedString(string: "\(item.seconds)秒", attributes: [
                    .font: rowFont, .foregroundColor: color, .paragraphStyle: rightAligned,
                ])
                let secondsW = ceil(seconds.size().width)
                seconds.draw(in: CGRect(x: pad, y: textY, width: width - pad * 2, height: rowFont.lineHeight))

                // 強さ bars between the name and the seconds: lit up to the
                // level, plus the bar this practice earned once the row is done.
                var levelW: CGFloat = 0
                if let level = item.level {
                    let done = activeIndex >= 0 && i < activeIndex
                    let lit = min(10, max(0, level) + (item.gained && done ? 1 : 0))
                    let barW = 7 * scale, gap = 2 * scale, barH = rowH * 0.42
                    let barsW = barW * 10 + gap * 9
                    let x0 = width - pad - secondsW - pad * 0.6 - barsW
                    let y0 = rowY + (rowH - barH) / 2
                    for b in 0..<10 {
                        (b < lit ? rainbow[b] : UIColor(white: 1, alpha: 0.18)).setFill()
                        UIBezierPath(
                            roundedRect: CGRect(x: x0 + CGFloat(b) * (barW + gap), y: y0, width: barW, height: barH),
                            cornerRadius: 2 * scale
                        ).fill()
                    }
                    levelW = barsW + pad * 0.6
                }

                let marker = i == activeIndex ? "▶ " : ""
                NSAttributedString(string: "\(marker)\(i + 1). \(item.name)", attributes: [
                    .font: rowFont, .foregroundColor: color, .paragraphStyle: truncating,
                ]).draw(in: CGRect(x: pad, y: textY,
                                   width: width - pad * 3 - secondsW - levelW, height: rowFont.lineHeight))
            }
        }

        // Design coordinates are measured from the top; Core Animation's origin
        // here is bottom-left, so the panel's bottom edge maps to this y.
        let left = 24 * renderSize.width / designWidth
        let bottomFromTop = 1130 * renderSize.height / designHeight
        let layer = CALayer()
        layer.frame = CGRect(x: left, y: renderSize.height - bottomFromTop, width: width, height: height)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    /// Discrete on/off opacity animation covering every window this layer is
    /// visible for. Discrete (not linear) so text appears instantly rather than
    /// fading, matching the web overlay's hard cuts.
    private static func applyVisibility(
        to layer: CALayer, windows: [(start: Double, end: Double)], totalMs: Double
    ) {
        guard totalMs > 0 else { return }
        var keyTimes: [NSNumber] = [0]
        var values: [NSNumber] = [0]
        for window in windows.sorted(by: { $0.start < $1.start }) {
            let start = max(0, min(1, window.start / totalMs))
            let end = max(0, min(1, window.end / totalMs))
            guard end > start else { continue }
            keyTimes.append(NSNumber(value: Double(start)))
            values.append(1)
            keyTimes.append(NSNumber(value: Double(end)))
            values.append(0)
        }
        guard values.count > 1 else { return }
        // Discrete timing needs one more key time than values: value i holds
        // from keyTimes[i] to keyTimes[i + 1]. With equal counts Core Animation
        // discards keyTimes and spaces the values evenly over the whole video —
        // which switched most countdown digits on together for long stretches,
        // stacking their translucent pills into one solid black block.
        keyTimes.append(1)

        let animation = CAKeyframeAnimation(keyPath: "opacity")
        animation.values = values
        animation.keyTimes = keyTimes
        animation.calculationMode = .discrete
        // Core Animation treats 0 as "now" during export; this constant is the
        // documented way to anchor an animation to the start of the video.
        animation.beginTime = AVCoreAnimationBeginTimeAtZero
        animation.duration = totalMs / 1000
        animation.isRemovedOnCompletion = false
        animation.fillMode = .both

        layer.opacity = 0
        layer.add(animation, forKey: "overlayVisibility")
    }

    /// Builds the overlay layer tree for the whole session.
    static func overlayLayer(
        segments: [Segment], totalDurationMs: Double, renderSize: CGSize,
        menu: [MenuItem] = []
    ) -> CALayer {
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: renderSize)
        container.masksToBounds = true

        if !menu.isEmpty {
            for (index, spans) in menuWindows(in: segments) {
                let panel = menuPanelLayer(menu: menu, activeIndex: index, renderSize: renderSize)
                applyVisibility(to: panel, windows: spans, totalMs: totalDurationMs)
                container.addSublayer(panel)
            }
        }

        for region in Region.allCases {
            for (text, spans) in windows(in: segments, region: region) {
                let style = style(for: region, text: text)
                let layer = labelLayer(text: text, style: style, renderSize: renderSize)
                applyVisibility(to: layer, windows: spans, totalMs: totalDurationMs)
                container.addSublayer(layer)
            }
        }
        return container
    }

    // MARK: - Sound mix (see SoundMixer.swift)

    typealias Sound = SoundMixer.Sound
    typealias VoiceTrack = SoundMixer.VoiceTrack

    static func bundledURL(forWebPath path: String) -> URL? {
        SoundMixer.resolve(path)
    }

    // MARK: - Export

    enum CompositorError: LocalizedError {
        case noVideoTrack
        case exportFailed(String)

        var errorDescription: String? {
            switch self {
            case .noVideoTrack: return "recording contains no video track"
            case .exportFailed(let m): return "export failed: \(m)"
            }
        }
    }

    /// The on-screen size of a track once its preferred transform is applied —
    /// a portrait recording reports a landscape naturalSize plus a rotation.
    private static func renderSize(for track: AVAssetTrack) async throws -> CGSize {
        let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
        let size = natural.applying(transform)
        return CGSize(width: abs(size.width), height: abs(size.height))
    }

    /// What an export managed to put in the audio.
    struct ExportResult {
        /// The voice and/or music made it into the file.
        let soundMixed: Bool
        /// Why (part of) the sound mix was dropped, if it was.
        let mixError: String?
    }

    /// The asset to export: the raw capture with the voice and music mixed in,
    /// or — if the full mix fails — with just the voice, so a broken music file
    /// can't cost the recording its sound. Falls back to the raw capture.
    private static func mixedAsset(
        source: AVURLAsset, sounds: [Sound], voice: VoiceTrack?
    ) async -> (asset: AVAsset, audioMix: AVAudioMix?, result: ExportResult) {
        guard !sounds.isEmpty || voice != nil else {
            return (source, nil, ExportResult(soundMixed: false, mixError: nil))
        }
        do {
            let mixed = try await SoundMixer.composition(source: source, sounds: sounds, voice: voice)
            return (mixed.composition, mixed.audioMix, ExportResult(soundMixed: true, mixError: nil))
        } catch {
            let fullError = error.localizedDescription
            print("⚡️  [KarateRecorder] sound mix failed: \(fullError)")
            if voice != nil, !sounds.isEmpty,
               let voiceOnly = try? await SoundMixer.composition(source: source, sounds: [], voice: voice) {
                print("⚡️  [KarateRecorder] exporting with the voice only")
                return (voiceOnly.composition, voiceOnly.audioMix, ExportResult(soundMixed: true, mixError: fullError))
            }
            return (source, nil, ExportResult(soundMixed: false, mixError: fullError))
        }
    }

    /// Runs one export, removing any partial output if it fails.
    private static func export(
        asset: AVAsset, videoComposition: AVVideoComposition?, audioMix: AVAudioMix?, to outputURL: URL
    ) async throws {
        guard let export = AVAssetExportSession(
            asset: asset, presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw CompositorError.exportFailed("could not create export session")
        }
        export.videoComposition = videoComposition
        export.audioMix = audioMix
        export.outputFileType = .mp4
        export.outputURL = outputURL
        export.shouldOptimizeForNetworkUse = true

        try? FileManager.default.removeItem(at: outputURL)
        // exportAsynchronously is deprecated in the iOS 18 SDK in favour of
        // export(to:as:), but it exists on every iOS version this app targets.
        // Wrapping it avoids depending on which async overload a given SDK has.
        do {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                export.exportAsynchronously {
                    if export.status == .completed {
                        cont.resume()
                    } else {
                        cont.resume(throwing: CompositorError.exportFailed(
                            export.error?.localizedDescription ?? "status \(export.status.rawValue)"
                        ))
                    }
                }
            }
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            throw error
        }
    }

    /// Burns `events` into `sourceURL`, writing an .mp4 to `outputURL`, with the
    /// voice and music mixed in.
    @discardableResult
    static func burn(
        sourceURL: URL,
        outputURL: URL,
        events: [Event],
        totalDurationMs: Double,
        menu: [MenuItem] = [],
        sounds: [Sound] = [],
        voice: VoiceTrack? = nil,
        badgeURL: URL? = nil
    ) async throws -> ExportResult {
        let started = Date()
        // Keep the source asset in this local for the whole export: composition
        // tracks don't retain it.
        let source = AVURLAsset(url: sourceURL)
        // With echo-cancelled input the microphone no longer hears the music or
        // character voices, so they are mixed back in from the original files.
        // A failed mix still exports the recording with its overlay.
        let (mixed, audioMix, result) = await mixedAsset(source: source, sounds: sounds, voice: voice)
        // The badge needs a composition to add its track to; without a mix the
        // asset is still the raw file.
        let asset: AVAsset = badgeURL == nil ? mixed : try await mutableComposition(of: mixed)
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw CompositorError.noVideoTrack
        }

        let size = try await renderSize(for: videoTrack)
        // The async factory is iOS 16+; the app still deploys to iOS 15, where
        // only the synchronous initializer exists.
        let composition: AVMutableVideoComposition
        if #available(iOS 16.0, *) {
            composition = try await AVMutableVideoComposition.videoComposition(withPropertiesOf: asset)
        } else {
            composition = AVMutableVideoComposition(propertiesOf: asset)
        }
        composition.renderSize = size

        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: size)
        let videoLayer = CALayer()
        videoLayer.frame = parentLayer.frame
        parentLayer.addSublayer(videoLayer)

        let segs = segments(from: events, totalDurationMs: totalDurationMs)
        if !segs.isEmpty {
            parentLayer.addSublayer(
                overlayLayer(segments: segs, totalDurationMs: totalDurationMs, renderSize: size, menu: menu)
            )
        }
        // Keep the badge asset alive for the export, like the source.
        var badge: AVURLAsset?
        if let badgeURL, let comp = asset as? AVMutableComposition {
            let clip = AVURLAsset(url: badgeURL)
            do {
                try await addBadge(clip, to: comp, videoComposition: composition, renderSize: size)
                badge = clip
            } catch {
                // A missing or broken badge must never cost the overlay.
                print("⚡️  [KarateRecorder] badge skipped: \(error.localizedDescription)")
            }
        }

        composition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer, in: parentLayer
        )

        try await export(asset: asset, videoComposition: composition, audioMix: audioMix, to: outputURL)
        withExtendedLifetime(source) {}
        withExtendedLifetime(badge) {}
        print(String(format: "⚡️  [KarateRecorder] burn export %.1f s for %.1f s of video (badge: %@)",
                     Date().timeIntervalSince(started), totalDurationMs / 1000, badge == nil ? "no" : "yes"))
        return result
    }

    // MARK: - Badge (アランのからて)

    /// The raw capture copied into a composition, so another track can be added.
    private static func mutableComposition(of asset: AVAsset) async throws -> AVMutableComposition {
        if let comp = asset as? AVMutableComposition { return comp }
        let comp = AVMutableComposition()
        for track in try await asset.load(.tracks) where track.mediaType == .video || track.mediaType == .audio {
            let (range, transform) = try await track.load(.timeRange, .preferredTransform)
            guard let copy = comp.addMutableTrack(withMediaType: track.mediaType,
                                                  preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
            try copy.insertTimeRange(range, of: track, at: range.start)
            copy.preferredTransform = transform
        }
        return comp
    }

    /// Loops the transparent badge clip (HEVC with alpha, no sound) over the
    /// whole video as a second video track, drawn bottom-right on top of the
    /// camera — mirroring the 特訓一覧 panel on the left.
    ///
    /// A track rather than Core Animation image frames: measured on the Mac,
    /// frames cost ~70 MB of decoded images, while the track adds ~5 MB and is
    /// decoded by the hardware HEVC decoder.
    private static func addBadge(
        _ clip: AVURLAsset, to comp: AVMutableComposition,
        videoComposition: AVMutableVideoComposition, renderSize: CGSize
    ) async throws {
        guard let source = try await clip.loadTracks(withMediaType: .video).first else {
            throw CompositorError.noVideoTrack
        }
        let (clipDuration, clipSize) = (try await clip.load(.duration), try await source.load(.naturalSize))
        let total = comp.duration
        guard clipDuration.seconds > 0.1, clipSize.width > 0, total.seconds > 0,
              let track = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { throw CompositorError.exportFailed("badge clip unusable") }
        var at = CMTime.zero
        while at < total {
            let length = CMTimeMinimum(clipDuration, total - at)
            try track.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: source, at: at)
            at = at + length
        }

        let old = videoComposition.instructions.compactMap { $0 as? AVVideoCompositionInstruction }
        guard !old.isEmpty else {
            comp.removeTrack(track)
            throw CompositorError.exportFailed("no video instructions to add the badge to")
        }

        // Design space 720x1280 like the rest of the overlay; composition
        // coordinates have their origin top-left.
        let side = (170 * renderSize.width / designWidth).rounded()
        let x = renderSize.width - side - 24 * renderSize.width / designWidth
        let y = 1130 * renderSize.height / designHeight - side
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        layer.setTransform(
            CGAffineTransform(scaleX: side / clipSize.width, y: side / clipSize.height)
                .concatenating(CGAffineTransform(translationX: x, y: y)),
            at: .zero
        )
        videoComposition.instructions = old.map { instruction in
            let copy = AVMutableVideoCompositionInstruction()
            copy.timeRange = instruction.timeRange
            copy.enablePostProcessing = instruction.enablePostProcessing
            copy.layerInstructions = [layer] + instruction.layerInstructions   // first = on top
            return copy
        }
    }

    /// The fallback when the overlay burn fails: the same sound mix into the raw
    /// video, with no overlay, so the family still gets a video with sound.
    /// Throws if there is nothing to mix or the mix itself fails.
    static func mixOnly(
        sourceURL: URL, outputURL: URL, sounds: [Sound], voice: VoiceTrack?
    ) async throws -> ExportResult {
        let source = AVURLAsset(url: sourceURL)
        let (asset, audioMix, result) = await mixedAsset(source: source, sounds: sounds, voice: voice)
        guard result.soundMixed else {
            throw CompositorError.exportFailed("no sound to mix: \(result.mixError ?? "nothing recorded")")
        }
        try await export(asset: asset, videoComposition: nil, audioMix: audioMix, to: outputURL)
        withExtendedLifetime(source) {}
        return result
    }
}
