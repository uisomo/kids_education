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

    /// The 「かざり」 the family picked on the 家族 tab. Free households always
    /// carry one; `.none` needs a paid plan, which the web side enforces before
    /// it ever reaches here.
    enum Decor: String {
        case frame, icon, banner, none

        /// The artwork in the web assets, cut out with alpha by tools/make-decor.swift.
        var assetPath: String? {
            switch self {
            case .frame: return "/images/decor-frame.png"
            case .icon: return "/images/decor-icon.png"
            case .banner: return "/images/decor-banner.png"
            case .none: return nil
            }
        }
    }

    /// Where the overlay's pieces sit once the decoration has taken its space:
    /// the frame pushes everything inward, the banner lifts the bottom panels.
    private struct Layout {
        var topInset: CGFloat = 0          // design px the top labels move down
        var sideInset: CGFloat = 24        // panel margin from each side
        var panelBottom: CGFloat = 1130    // design Y the bottom panels sit on
        /// 工夫 as a full-width strip above 特訓一覧 (and Alan's badge), so the
        /// list keeps its full width: beside it there's no room for names.
        var kufuAboveAll = false
    }

    /// Alan's badge in the corner: size and bottom edge in design space.
    private static let iconSide: CGFloat = 190
    private static let iconBottom: CGFloat = 1250

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
        /// 🪝 read-aloud hook: the words revealed so far, in their typed lines.
        var texts: [[String]] = []
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
        /// Top of the box's vertical gradient (the whole fill when flat).
        var background: UIColor
        /// Bottom of that gradient; nil draws a flat box.
        var backgroundEnd: UIColor? = nil
        /// Hairline drawn around the box, on top of the fill.
        var stroke: UIColor? = nil
        /// Draw only the text, with a dark outline and shadow, and no box behind
        /// it — used for the countdowns so they don't cover the child.
        var outlined = false
    }

    private static let designWidth: CGFloat = 720
    private static let designHeight: CGFloat = 1280

    /// The boxes behind the overlay text. A deep indigo lit from the top with a
    /// gold hairline, rather than flat black — it reads as part of the app
    /// instead of a subtitle burned over the picture.
    private static let boxTop = UIColor(red: 0x2a / 255, green: 0x20 / 255, blue: 0x4a / 255, alpha: 0.86)
    private static let boxBottom = UIColor(red: 0x0d / 255, green: 0x0a / 255, blue: 0x1e / 255, alpha: 0.70)
    private static let gold = UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1)

    /// The 特訓一覧 and 工夫 panels are see-through, so the child stays visible
    /// behind them; a soft shadow under their text keeps it readable instead.
    private static let panelFillTop = boxTop.withAlphaComponent(0.42)
    private static let panelFillBottom = boxBottom.withAlphaComponent(0.30)

    private static func textShadow(_ scale: CGFloat) -> NSShadow {
        let shadow = NSShadow()
        shadow.shadowColor = UIColor(white: 0, alpha: 0.85)
        shadow.shadowOffset = CGSize(width: 0, height: 1.5 * scale)
        shadow.shadowBlurRadius = 4 * scale
        return shadow
    }

    private static func style(for region: Region) -> Style {
        switch region {
        case .drill:
            return Style(centerX: 0.5, centerY: 90 / designHeight, fontPx: 44,
                         color: .white,
                         background: boxTop, backgroundEnd: boxBottom,
                         stroke: gold.withAlphaComponent(0.55))
        case .seconds:
            // A small badge on the drill name's line (placed beside the name by
            // countdownLayers) — a big number lower down covered the child's face.
            return Style(centerX: 0.5, centerY: 90 / designHeight, fontPx: 40,
                         color: gold,
                         background: boxTop, backgroundEnd: boxBottom,
                         stroke: gold.withAlphaComponent(0.55))
        case .cue:
            return Style(centerX: 0.5, centerY: 0.5, fontPx: 72,
                         color: gold,
                         background: UIColor(red: 0xe8 / 255, green: 0x41 / 255, blue: 0x4f / 255, alpha: 0.92),
                         backgroundEnd: UIColor(red: 0xa3 / 255, green: 0x1a / 255, blue: 0x2d / 255, alpha: 0.9),
                         stroke: UIColor(white: 1, alpha: 0.55))
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
            if let v = event.patch["texts"] as? [[String]] { state.texts = v }
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

    // MARK: - Fonts

    /// The app's rounded face (M PLUS Rounded 1c), shipped with the web assets
    /// so the burned video is set in the same type as the screen. Registered
    /// once with Core Text; if the file is missing the overlay falls back to
    /// Hiragino and nothing else changes.
    private nonisolated(unsafe) static var fontsRegistered = false

    private static func registerFonts() {
        guard !fontsRegistered else { return }
        fontsRegistered = true
        for path in ["/fonts/MPLUSRounded1c-ExtraBold.ttf", "/fonts/MPLUSRounded1c-Medium.ttf"] {
            guard let url = SoundMixer.resolve(path) else {
                print("⚡️  [KarateRecorder] font missing: \(path)")
                continue
            }
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                let reason = error?.takeRetainedValue().localizedDescription ?? "unknown"
                print("⚡️  [KarateRecorder] font not registered: \(path) — \(reason)")
            }
        }
    }

    /// heavy: 種目名・カウントダウン・見出し. Otherwise the text weight used for
    /// the list rows and the 工夫 body.
    private static func playfulFont(_ size: CGFloat, heavy: Bool = true) -> UIFont {
        registerFonts()
        if let font = UIFont(name: heavy ? "RoundedMplus1c-ExtraBold" : "RoundedMplus1c-Medium", size: size) {
            return font
        }
        return UIFont(name: heavy ? "HiraginoSans-W8" : "HiraginoSans-W6", size: size)
            ?? UIFont.systemFont(ofSize: size, weight: heavy ? .black : .bold)
    }

    // MARK: - Layer construction

    /// One overlay box: a vertical gradient, an optional hairline and a soft
    /// drop shadow. The shadow is painted by a first flat fill — a gradient
    /// needs a clip, and clipping throws the shadow away.
    private static func drawBox(
        _ rect: CGRect, radius: CGFloat, top: UIColor, bottom: UIColor?,
        stroke: UIColor? = nil, strokeWidth: CGFloat = 0, shadow: CGFloat = 0, in ctx: CGContext
    ) {
        let path = UIBezierPath(roundedRect: rect, cornerRadius: radius)
        ctx.saveGState()
        if shadow > 0 {
            ctx.setShadow(offset: CGSize(width: 0, height: shadow * 0.3), blur: shadow,
                          color: UIColor(white: 0, alpha: 0.5).cgColor)
        }
        top.setFill()
        path.fill()
        ctx.restoreGState()

        if let bottom {
            ctx.saveGState()
            path.addClip()
            let colors = [top.cgColor, bottom.cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                         colors: colors, locations: [0, 1]) {
                ctx.drawLinearGradient(gradient,
                                       start: CGPoint(x: rect.minX, y: rect.minY),
                                       end: CGPoint(x: rect.minX, y: rect.maxY), options: [])
            }
            ctx.restoreGState()
        }

        if let stroke, strokeWidth > 0 {
            let inset = strokeWidth / 2
            let line = UIBezierPath(roundedRect: rect.insetBy(dx: inset, dy: inset),
                                    cornerRadius: max(1, radius - inset))
            stroke.setStroke()
            line.lineWidth = strokeWidth
            line.stroke()
        }
    }

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

        let font = playfulFont(fontSize)
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: style.color,
        ]
        // Without a box, a dark outline and soft shadow keep the digits
        // readable over any background. The outline is its own pass drawn
        // UNDER the fill: a fill+stroke pass centres the stroke on the glyph
        // edge, so half of it ate into the gold and the rounded digits came
        // out thin and square-looking — not like the app's font on screen.
        var outline: NSAttributedString?
        if style.outlined {
            // A wider outline would make neighbouring digits touch.
            attributes[.kern] = fontSize * 0.06
            let shadow = NSShadow()
            shadow.shadowColor = UIColor(white: 0, alpha: 0.6)
            shadow.shadowBlurRadius = fontSize * 0.08
            shadow.shadowOffset = CGSize(width: 0, height: fontSize * 0.02)
            var outlineAttributes = attributes
            outlineAttributes[.foregroundColor] = UIColor(white: 0, alpha: 0.85)
            outlineAttributes[.strokeColor] = UIColor(white: 0, alpha: 0.85)
            outlineAttributes[.strokeWidth] = 16     // positive = stroke only; ~8% shows outside
            outlineAttributes[.shadow] = shadow
            outline = NSAttributedString(string: text, attributes: outlineAttributes)
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
        // Room around the box for its drop shadow, or for the outline.
        let margin = ceil(fontSize * (style.outlined ? 0.12 : 0.3))
        let imageSize = CGSize(width: boxW + margin * 2, height: boxH + margin * 2)
        let image = UIGraphicsImageRenderer(size: imageSize, format: format).image { ctx in
            if !style.outlined {
                drawBox(CGRect(x: margin, y: margin, width: boxW, height: boxH),
                        radius: fontSize * 0.34,
                        top: style.background, bottom: style.backgroundEnd,
                        stroke: style.stroke, strokeWidth: max(1, 2 * fontScale),
                        shadow: margin, in: ctx.cgContext)
            }
            let origin = CGPoint(
                x: margin + (boxW - textSize.width) / 2,
                y: margin + (boxH - textSize.height) / 2
            )
            outline?.draw(at: origin)
            attributed.draw(at: origin)
        }

        // Core Animation's origin is bottom-left here, but the design
        // coordinates are measured from the top, so flip Y.
        let centerX = style.centerX * renderSize.width
        let centerY = renderSize.height - style.centerY * renderSize.height

        let layer = CALayer()
        layer.frame = CGRect(x: centerX - imageSize.width / 2, y: centerY - imageSize.height / 2,
                             width: imageSize.width, height: imageSize.height)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    /// 「🔥 N日間 毎日継続中」 pinned top-left for the whole video. Small enough to
    /// sit above the drill-name pill (whose top is at ~52 in design space).
    private static func streakLayer(text: String, renderSize: CGSize, topInset: CGFloat = 0) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let fontSize = 22 * scale
        let font = playfulFont(fontSize)
        let attributed = NSAttributedString(string: text, attributes: [
            .font: font, .foregroundColor: UIColor.white,
        ])
        let textSize = attributed.size()
        let padX = 12 * scale
        let padY = 6 * scale
        let w = ceil(textSize.width + padX * 2)
        let h = ceil(textSize.height + padY * 2)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format).image { ctx in
            drawBox(CGRect(x: 0, y: 0, width: w, height: h), radius: h / 2,
                    top: boxTop, bottom: boxBottom,
                    stroke: gold.withAlphaComponent(0.5), strokeWidth: max(1, 1.5 * scale),
                    in: ctx.cgContext)
            attributed.draw(at: CGPoint(x: padX, y: padY))
        }

        // Core Animation's origin is bottom-left; design coordinates are from the top.
        let left = 24 * renderSize.width / designWidth
        let top = (12 + topInset) * renderSize.height / designHeight
        let layer = CALayer()
        layer.frame = CGRect(x: left, y: renderSize.height - top - h, width: w, height: h)
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

    private static let maxMenuRows = 3

    /// Design width of the 特訓一覧 panel. Rows with 強さ bars need more room,
    /// or the large three-row font leaves 「正拳突き」 as 「正…」: measured with
    /// the M PLUS Rounded font, 440 fits 「10. 上段揚げ受け」 with bars and
    /// 「30秒」. Capped by `limit` so a 工夫 panel beside it keeps its minimum.
    private static func menuPanelDesignWidth(_ menu: [MenuItem], limit: CGFloat) -> CGFloat {
        menu.isEmpty ? 0 : min(limit, menu.contains { $0.level != nil } ? 440 : 360)
    }

    /// The narrowest a 工夫 panel beside 特訓一覧 may get.
    private static let minKufuWidth: CGFloat = 180

    /// The session's menu with each drill's length in seconds, so anyone
    /// watching the video can follow the practice. The running drill is
    /// highlighted, finished ones are dimmed. Three large rows show — the one
    /// before, the running one and the next — and a longer menu scrolls. Anchored bottom-left above the 工夫
    /// caption, over the body rather than the face.
    private static func menuPanelLayer(
        menu: [MenuItem], activeIndex: Int, renderSize: CGSize, beltLabel: String? = nil,
        menuName: String? = nil, designPanelWidth: CGFloat = 360,
        bottomY: CGFloat = defaultPanelBottom, sideInset: CGFloat = 24
    ) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let pad = 14 * scale
        // Three large rows, so the list reads at a glance and never runs up
        // over the face. The window keeps the row before the running one in
        // view; past the end it rests on the last three.
        let rowH = 46 * scale
        let first = menu.count <= maxMenuRows
            ? 0 : max(0, min(activeIndex - 1, menu.count - maxMenuRows))
        let visible = Array(menu.enumerated().dropFirst(first).prefix(maxMenuRows))
        let hiddenBelow = menu.count - first - visible.count
        // Reserved on every panel of a long menu, so the panel keeps one height
        // as it scrolls instead of jumping when 「あと N」 runs out.
        let footerH: CGFloat = menu.count > maxMenuRows ? 26 * scale : 0
        // Rows with a 強さ level get 10 small bars, so the panel is a bit wider.
        let width = designPanelWidth * scale

        // 「強くなるため  ⚪ 白帯」: a saved menu's own name heads the list, an
        // unsaved one keeps 「特訓一覧」. A long name wraps onto a second line
        // (truncating after that), so the panel grows upward rather than wider.
        let shadow = textShadow(scale)
        let titleFont = playfulFont(28 * scale)
        let name = menuName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let heading = name.isEmpty ? "特訓一覧" : name
        let title = beltLabel.map { "\(heading)  \($0)" } ?? heading
        let titleStyle = NSMutableParagraphStyle()
        titleStyle.lineBreakMode = .byWordWrapping
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: titleFont, .foregroundColor: gold, .paragraphStyle: titleStyle, .shadow: shadow,
        ]
        let titleW = width - pad * 2
        let measuredH = NSAttributedString(string: title, attributes: titleAttrs).boundingRect(
            with: CGSize(width: titleW, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
        ).height
        let titleLines: CGFloat = measuredH > titleFont.lineHeight * 1.5 ? 2 : 1
        let titleH = 40 * scale + (titleLines - 1) * titleFont.lineHeight
        let height = ceil(pad + titleH + rowH * CGFloat(visible.count) + footerH + pad)

        let yellow = gold
        let rowFont = playfulFont(rowH * 0.62, heavy: false)

        let rightAligned = NSMutableParagraphStyle()
        rightAligned.alignment = .right
        let truncating = NSMutableParagraphStyle()
        truncating.lineBreakMode = .byTruncatingTail

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height), format: format
        ).image { ctx in
            drawBox(CGRect(x: 0, y: 0, width: width, height: height), radius: 18 * scale,
                    top: panelFillTop, bottom: panelFillBottom,
                    stroke: gold.withAlphaComponent(0.45), strokeWidth: max(1, 1.5 * scale),
                    in: ctx.cgContext)

            NSAttributedString(string: title, attributes: titleAttrs).draw(
                with: CGRect(x: pad, y: pad, width: titleW, height: titleFont.lineHeight * titleLines),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil
            )

            for (slot, (i, item)) in visible.enumerated() {
                let rowY = pad + titleH + CGFloat(slot) * rowH
                let color: UIColor
                if i == activeIndex {
                    yellow.withAlphaComponent(0.28).setFill()
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
                    .font: rowFont, .foregroundColor: color, .paragraphStyle: rightAligned, .shadow: shadow,
                ])
                let secondsW = ceil(seconds.size().width)
                seconds.draw(in: CGRect(x: pad, y: textY, width: width - pad * 2, height: rowFont.lineHeight))

                // 強さ bars between the name and the seconds: lit up to the
                // level, plus the bar this practice earned once the row is done.
                var levelW: CGFloat = 0
                if let level = item.level {
                    let done = activeIndex >= 0 && i < activeIndex
                    let lit = min(10, max(0, level) + (item.gained && done ? 1 : 0))
                    let barW = 6 * scale, gap = 2 * scale, barH = rowH * 0.42
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

                // No 「▶」 on the running row: the highlight already marks it, and
                // the glyph cost the name its last characters.
                NSAttributedString(string: "\(i + 1). \(item.name)", attributes: [
                    .font: rowFont, .foregroundColor: color, .paragraphStyle: truncating, .shadow: shadow,
                ]).draw(in: CGRect(x: pad, y: textY,
                                   width: width - pad * 3 - secondsW - levelW, height: rowFont.lineHeight))
            }

            if hiddenBelow > 0 {
                let footerFont = playfulFont(21 * scale, heavy: false)
                NSAttributedString(string: "▼ あと\(hiddenBelow)", attributes: [
                    .font: footerFont, .foregroundColor: UIColor(white: 1, alpha: 0.75), .shadow: shadow,
                ]).draw(at: CGPoint(x: pad * 1.5,
                                    y: pad + titleH + rowH * CGFloat(visible.count)
                                        + (footerH - footerFont.lineHeight) / 2))
            }
        }

        // Design coordinates are measured from the top; Core Animation's origin
        // here is bottom-left, so the panel's bottom edge maps to this y.
        let left = sideInset * renderSize.width / designWidth
        let bottomFromTop = bottomY * renderSize.height / designHeight
        let layer = CALayer()
        layer.frame = CGRect(x: left, y: renderSize.height - bottomFromTop, width: width, height: height)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    /// 工夫 as a panel on the right, mirroring 特訓一覧 on the left — it used to
    /// be a single line across the bottom, which left no room for more than a
    /// few words and sat where the banner now goes. Wraps over several lines
    /// and grows upwards from the same bottom edge as the menu panel.
    private static func kufuPanelLayer(
        text: String, renderSize: CGSize, bottomY: CGFloat = defaultPanelBottom,
        sideInset: CGFloat = 24, designPanelWidth: CGFloat = 300
    ) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let pad = 16 * scale
        let width = designPanelWidth * scale
        let shadow = textShadow(scale)
        let titleFont = playfulFont(24 * scale)
        let bodyFont = playfulFont(27 * scale, heavy: false)

        // Word wrapping, truncated only on the last line that fits (see the
        // draw options): .byTruncatingTail alone forced a single line, which
        // cut a 工夫 to 「こうしたらいいん…」 in a panel with room for five.
        let wrapping = NSMutableParagraphStyle()
        wrapping.lineBreakMode = .byWordWrapping
        wrapping.lineSpacing = 3 * scale
        let title = NSAttributedString(string: "💡 工夫", attributes: [
            .font: titleFont, .foregroundColor: gold, .shadow: shadow,
        ])
        let body = NSAttributedString(string: text, attributes: [
            .font: bodyFont, .foregroundColor: UIColor.white, .paragraphStyle: wrapping, .shadow: shadow,
        ])

        // A full-width strip puts 「💡 工夫」 and the text on one line to stay
        // short (two lines at most); a side panel stacks them (five at most),
        // so a long 工夫 can never run up over the face.
        let inline = designPanelWidth >= 500
        let content: NSAttributedString
        if inline {
            let line = NSMutableAttributedString(attributedString: title)
            line.append(NSAttributedString(string: "  ", attributes: [.font: bodyFont]))
            line.append(body)
            line.addAttribute(.paragraphStyle, value: wrapping, range: NSRange(location: 0, length: line.length))
            content = line
        } else {
            content = body
        }
        let maxLines: CGFloat = inline ? 2 : 5
        let textWidth = width - pad * 2
        let maxBodyH = ceil(bodyFont.lineHeight * maxLines + wrapping.lineSpacing * (maxLines - 1))
        let bodyH = min(maxBodyH, ceil(content.boundingRect(
            with: CGSize(width: textWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
        ).height))
        let titleH = inline ? 0 : ceil(titleFont.lineHeight)
        let gap = inline ? 0 : 8 * scale
        let height = ceil(pad * 2 + titleH + gap + bodyH)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height), format: format
        ).image { ctx in
            drawBox(CGRect(x: 0, y: 0, width: width, height: height), radius: 18 * scale,
                    top: panelFillTop, bottom: panelFillBottom,
                    stroke: gold.withAlphaComponent(0.45), strokeWidth: max(1, 1.5 * scale),
                    in: ctx.cgContext)
            if !inline {
                title.draw(in: CGRect(x: pad, y: pad, width: textWidth, height: titleH))
            }
            content.draw(with: CGRect(x: pad, y: pad + titleH + gap, width: textWidth, height: bodyH),
                         options: [.usesLineFragmentOrigin, .usesFontLeading, .truncatesLastVisibleLine],
                         context: nil)
        }

        let right = sideInset * renderSize.width / designWidth
        let bottomFromTop = bottomY * renderSize.height / designHeight
        let layer = CALayer()
        layer.frame = CGRect(x: renderSize.width - right - width,
                             y: renderSize.height - bottomFromTop, width: width, height: height)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    // MARK: - Banner

    /// Design-space Y (from the top) the bottom-anchored panels sit on when
    /// nothing is taking the space below them.
    private static let defaultPanelBottom: CGFloat = 1130

    /// Alan's artwork for this decoration. A missing file simply means no
    /// decoration — it must never cost the family their video.
    private static func decorImage(_ decor: Decor) -> UIImage? {
        guard let path = decor.assetPath, let url = SoundMixer.resolve(path) else { return nil }
        guard let image = UIImage(contentsOfFile: url.path) else {
            print("⚡️  [KarateRecorder] decor unreadable: \(path)")
            return nil
        }
        return image
    }

    private static func layout(for decor: Decor, image: UIImage?, renderSize: CGSize) -> Layout {
        guard let image else { return Layout() }
        switch decor {
        case .banner:
            // The strip keeps its aspect ratio at full width; the panels sit above it.
            let designH = designWidth * image.size.height / max(image.size.width, 1)
            return Layout(panelBottom: min(defaultPanelBottom, designHeight - designH - 18))
        case .frame:
            // Inside the drawn border: the title and Alan fill the top of the
            // frame, and the crayon edge runs down both sides and along the
            // bottom, so every label and panel moves in past it. That leaves
            // too little width for 特訓一覧 and 工夫 side by side (names were cut
            // to 「上段揚げ…」), so 工夫 goes above.
            // The list sits low, reaching into the inside of the crayon band
            // along the bottom (it starts near 1200): the panels are see-through.
            return Layout(topInset: 190, sideInset: 70, panelBottom: 1220, kufuAboveAll: true)
        case .icon:
            // Bottom-right, out of the drill name's way — it is centred at the
            // top and a long name reaches well into the corner up there.
            // 特訓一覧 drops level with the badge; 工夫 spans the width above.
            return Layout(panelBottom: iconBottom, kufuAboveAll: true)
        case .none:
            return Layout()
        }
    }

    /// The frame covers the whole picture; the banner is a strip on the bottom
    /// edge; the icon is a badge in the top-right corner, opposite the streak.
    private static func decorLayer(_ decor: Decor, image: UIImage, renderSize: CGSize) -> CALayer {
        let layer = CALayer()
        layer.contents = image.cgImage
        switch decor {
        case .frame:
            layer.frame = CGRect(origin: .zero, size: renderSize)
            layer.contentsGravity = .resize
        case .banner:
            let height = (renderSize.width * image.size.height / max(image.size.width, 1)).rounded()
            // Core Animation's origin is bottom-left here, so y = 0 is the bottom edge.
            layer.frame = CGRect(x: 0, y: 0, width: renderSize.width, height: height)
            layer.contentsGravity = .resizeAspect
        case .icon:
            let side = (iconSide * renderSize.width / designWidth).rounded()
            let right = 20 * renderSize.width / designWidth
            // Core Animation's origin is bottom-left; the design Y is from the top.
            let bottom = renderSize.height - iconBottom * renderSize.height / designHeight
            layer.frame = CGRect(x: renderSize.width - side - right, y: bottom, width: side, height: side)
            layer.contentsGravity = .resizeAspect
        case .none:
            break
        }
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

    /// Width of the box labelLayer() draws around `text` (without its shadow
    /// margin), in video pixels — so neighbouring labels can be placed.
    private static func labelBoxWidth(_ text: String, fontPx: CGFloat, renderSize: CGSize) -> CGFloat {
        let fontSize = fontPx * min(renderSize.width / designWidth, renderSize.height / designHeight)
        let size = NSAttributedString(string: text, attributes: [.font: playfulFont(fontSize)]).size()
        return ceil(size.width + fontSize)   // + padX * 2
    }

    /// Holds `layer`'s x at `xs[i]` from `spans[i].start` on (discrete), so one
    /// layer per number can sit beside whichever drill name is showing.
    private static func applyPositionX(
        to layer: CALayer, starts: [Double], xs: [CGFloat], totalMs: Double
    ) {
        guard totalMs > 0, let first = xs.first else { return }
        layer.position.x = first
        guard xs.count > 1 else { return }
        let animation = CAKeyframeAnimation(keyPath: "position.x")
        animation.values = [first] + xs
        // Discrete: one more key time than values (see applyVisibility).
        animation.keyTimes = [0] + starts.map { NSNumber(value: max(0, min(1, $0 / totalMs))) } + [1]
        animation.calculationMode = .discrete
        animation.beginTime = AVCoreAnimationBeginTimeAtZero
        animation.duration = totalMs / 1000
        animation.isRemovedOnCompletion = false
        animation.fillMode = .both
        layer.add(animation, forKey: "overlayPositionX")
    }

    /// The countdown as a small badge right of the drill-name pill. One layer
    /// per number (as before); its x follows the drill name's width.
    private static func countdownLayers(
        segments: [Segment], renderSize: CGSize, topInset: CGFloat, totalMs: Double
    ) -> [CALayer] {
        var byText: [String: [(start: Double, end: Double, drill: String)]] = [:]
        for segment in segments {
            let text = segment.state.text(for: .seconds)
            guard !text.isEmpty else { continue }
            var list = byText[text] ?? []
            if let last = list.last, abs(last.end - segment.startMs) < 1, last.drill == segment.state.drill {
                list[list.count - 1].end = segment.endMs
            } else {
                list.append((start: segment.startMs, end: segment.endMs, drill: segment.state.drill))
            }
            byText[text] = list
        }

        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let gap = 12 * scale
        let drillFont = style(for: .drill).fontPx
        var drillWidths: [String: CGFloat] = [:]
        var out: [CALayer] = []
        for (text, spans) in byText {
            var itemStyle = style(for: .seconds)
            itemStyle.centerY += topInset / designHeight
            let layer = labelLayer(text: text, style: itemStyle, renderSize: renderSize)
            let secsW = labelBoxWidth(text, fontPx: itemStyle.fontPx, renderSize: renderSize)
            let sorted = spans.sorted { $0.start < $1.start }
            let xs: [CGFloat] = sorted.map { span in
                guard !span.drill.isEmpty else { return renderSize.width / 2 }
                let drillW = drillWidths[span.drill]
                    ?? labelBoxWidth(span.drill, fontPx: drillFont, renderSize: renderSize)
                drillWidths[span.drill] = drillW
                let x = renderSize.width / 2 + drillW / 2 + gap + secsW / 2
                // A very long name would push the badge off the frame.
                return min(x, renderSize.width - secsW / 2 - 8 * scale)
            }
            applyVisibility(to: layer, windows: sorted.map { (start: $0.start, end: $0.end) },
                            totalMs: totalMs)
            applyPositionX(to: layer, starts: sorted.map { $0.start }, xs: xs, totalMs: totalMs)
            out.append(layer)
        }
        return out
    }

    /// 🪝 The read-aloud hook at the start of the video, drawn like
    /// 言えるようになるアプリ's opening: each line huge and white with a thick
    /// black outline and a solid red drop, a little tilted, landing with a
    /// zoom-out. Each line keeps its slot, shows from its reveal to the end of
    /// the hook, and the ドン in the mix hits as it stops.
    private static func hookLayers(
        segments: [Segment], renderSize: CGSize, topInset: CGFloat, totalMs: Double
    ) -> [CALayer] {
        // The fullest grid logged is the finished layout (one entry per line).
        guard let grid = segments.map(\.state.texts)
            .max(by: { $0.count < $1.count }),
            !grid.isEmpty else { return [] }

        let rowY0: CGFloat = 250, rowH: CGFloat = 185
        let tilts: [CGFloat] = [-0.07, 0.05, -0.035]
        var out: [CALayer] = []
        for (row, words) in grid.enumerated() {
            let text = words.joined(separator: " ")
            guard !text.isEmpty else { continue }
            var spans: [(start: Double, end: Double)] = []
            for segment in segments where row < segment.state.texts.count {
                if let last = spans.last, abs(last.end - segment.startMs) < 1 {
                    spans[spans.count - 1].end = segment.endMs
                } else {
                    spans.append((start: segment.startMs, end: segment.endMs))
                }
            }
            guard let firstStart = spans.first?.start else { continue }

            // The tilt lives on a holder so the zoom (a transform.scale
            // animation, which replaces the whole transform) can't undo it.
            let line = hookLineLayer(text: text, renderSize: renderSize)
            let holder = CALayer()
            holder.bounds = line.bounds
            line.position = CGPoint(x: line.bounds.midX, y: line.bounds.midY)
            holder.addSublayer(line)
            let centerY = (rowY0 + CGFloat(row) * rowH + topInset) * renderSize.height / designHeight
            // Bottom-left origin: flip Y.
            holder.position = CGPoint(x: renderSize.width / 2, y: renderSize.height - centerY)
            // Core Animation's y axis points up, so a positive angle tilts the
            // other way from the screen's CSS rotate.
            holder.setAffineTransform(CGAffineTransform(rotationAngle: -tilts[row % tilts.count]))
            applyVisibility(to: holder, windows: spans, totalMs: totalMs)

            let zoom = CAKeyframeAnimation(keyPath: "transform.scale")
            zoom.values = [2.6, 0.95, 1.0]
            zoom.keyTimes = [0, 0.75, 1]
            zoom.beginTime = firstStart > 0 ? firstStart / 1000 : AVCoreAnimationBeginTimeAtZero
            zoom.duration = 0.27
            zoom.isRemovedOnCompletion = false
            zoom.fillMode = .backwards
            line.add(zoom, forKey: "hookZoom")
            out.append(holder)
        }
        return out
    }

    /// One hook line as an image: 130 design px, shrunk to fit 640 px wide.
    private static func hookLineLayer(text: String, renderSize: CGSize) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        var fontSize = 130 * scale
        let maxW = 640 * scale
        let natural = NSAttributedString(string: text, attributes: [.font: playfulFont(fontSize)]).size().width
        if natural > maxW { fontSize *= maxW / natural }
        let font = playfulFont(fontSize)

        let outlineW = fontSize * 0.1          // outline showing outside the glyph
        let drop = fontSize * 0.1              // red drop offset
        let red = UIColor(red: 0xe5 / 255, green: 0x24 / 255, blue: 0x3b / 255, alpha: 1)
        let ink = UIColor(white: 0x11 / 255, alpha: 1)
        // NSAttributedString stroke widths are a percentage of the font size.
        let strokePct = outlineW / fontSize * 100 * 2
        func attr(_ fill: UIColor, stroke: UIColor?) -> NSAttributedString {
            var a: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: fill]
            if let stroke { a[.strokeColor] = stroke; a[.strokeWidth] = strokePct }
            return NSAttributedString(string: text, attributes: a)
        }
        let size = attr(.white, stroke: nil).size()
        let pad = ceil(outlineW + drop + fontSize * 0.05)
        let imageSize = CGSize(width: ceil(size.width + pad * 2), height: ceil(size.height + pad * 2))

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: imageSize, format: format).image { _ in
            let origin = CGPoint(x: pad, y: pad)
            let dropOrigin = CGPoint(x: pad + drop, y: pad + drop)
            // Red drop (outlined in red too, so it is as fat as the outline).
            attr(red, stroke: red).draw(at: dropOrigin)
            attr(red, stroke: nil).draw(at: dropOrigin)
            // Black outline under the white fill, so the outline doesn't eat it.
            attr(ink, stroke: ink).draw(at: origin)
            attr(.white, stroke: nil).draw(at: origin)
        }
        let layer = CALayer()
        layer.bounds = CGRect(origin: .zero, size: imageSize)
        layer.contents = image.cgImage
        layer.contentsGravity = .resize
        return layer
    }

    /// Builds the overlay layer tree for the whole session.
    static func overlayLayer(
        segments: [Segment], totalDurationMs: Double, renderSize: CGSize,
        menu: [MenuItem] = [], beltLabel: String? = nil, menuName: String? = nil,
        streakLabel: String? = nil, decor: Decor = .none
    ) -> CALayer {
        let container = CALayer()
        container.frame = CGRect(origin: .zero, size: renderSize)
        container.masksToBounds = true

        let art = decorImage(decor)
        let box = layout(for: decor, image: art, renderSize: renderSize)

        // Always under the overlay: the practice itself — the drill name, the
        // 特訓一覧 and the 工夫 — has to stay readable, so nothing decorative is
        // ever drawn over it. The layout insets keep them off the artwork.
        if let art {
            container.addSublayer(decorLayer(decor, image: art, renderSize: renderSize))
        }

        // Design Y of the 特訓一覧 panel's top edge (every scroll position has
        // the same height), for a 工夫 strip that has to clear it.
        var menuTop: CGFloat?
        // Beside a 工夫 panel the list leaves it room; under a full-width 工夫 strip
        // it can take its full size.
        let menuW = menuPanelDesignWidth(
            menu, limit: box.kufuAboveAll
                ? designWidth - box.sideInset * 2
                : designWidth - box.sideInset * 2 - 16 - minKufuWidth)
        if !menu.isEmpty {
            for (index, spans) in menuWindows(in: segments) {
                let panel = menuPanelLayer(menu: menu, activeIndex: index, renderSize: renderSize,
                                           beltLabel: beltLabel, menuName: menuName,
                                           designPanelWidth: menuW,
                                           bottomY: box.panelBottom,
                                           sideInset: box.sideInset)
                applyVisibility(to: panel, windows: spans, totalMs: totalDurationMs)
                container.addSublayer(panel)
                // Bottom-left origin: the panel's top edge is frame.maxY from the bottom.
                let top = (renderSize.height - panel.frame.maxY) * designHeight / renderSize.height
                menuTop = min(menuTop ?? top, top)
            }
        }

        for layer in hookLayers(segments: segments, renderSize: renderSize,
                                topInset: box.topInset, totalMs: totalDurationMs) {
            container.addSublayer(layer)
        }

        for region in Region.allCases {
            if region == .seconds {
                for layer in countdownLayers(segments: segments, renderSize: renderSize,
                                             topInset: box.topInset, totalMs: totalDurationMs) {
                    container.addSublayer(layer)
                }
                continue
            }
            for (text, spans) in windows(in: segments, region: region) {
                // 工夫 is a panel on the right, not a line of text in a pill.
                let layer: CALayer
                if region == .caption {
                    let kufuW: CGFloat, kufuBottom: CGFloat
                    if box.kufuAboveAll {
                        // Full width, clear of the list and of Alan's badge.
                        kufuW = designWidth - box.sideInset * 2
                        var clear = menuTop ?? box.panelBottom
                        if decor == .icon { clear = min(clear, iconBottom - iconSide) }
                        kufuBottom = clear - 14
                    } else {
                        // Beside 特訓一覧, never over it: the frame's wide margins
                        // used to push the two fixed-width panels into each other.
                        let beside = designWidth - box.sideInset * 2 - menuW - 16
                        kufuW = min(300, max(minKufuWidth, beside))
                        kufuBottom = box.panelBottom
                    }
                    layer = kufuPanelLayer(text: text, renderSize: renderSize, bottomY: kufuBottom,
                                           sideInset: box.sideInset, designPanelWidth: kufuW)
                    // Side by side, the two boxes share a top edge. Only while 工夫
                    // is the shorter one: a taller box would drop onto the banner.
                    if !box.kufuAboveAll, let menuTop {
                        let topPx = menuTop * renderSize.height / designHeight
                        let bottomPx = box.panelBottom * renderSize.height / designHeight
                        if topPx + layer.frame.height <= bottomPx {
                            // Bottom-left origin: y is the box's bottom edge from the bottom.
                            layer.frame.origin.y = renderSize.height - topPx - layer.frame.height
                        }
                    }
                } else {
                    var itemStyle = style(for: region, text: text)
                    // Only the labels hung from the top move for the frame; the
                    // cue sits in the middle of the picture.
                    if region == .drill {
                        itemStyle.centerY += box.topInset / designHeight
                    }
                    layer = labelLayer(text: text, style: itemStyle, renderSize: renderSize)
                }
                applyVisibility(to: layer, windows: spans, totalMs: totalDurationMs)
                container.addSublayer(layer)
            }
        }

        if let streakLabel, !streakLabel.isEmpty {
            container.addSublayer(streakLayer(text: streakLabel, renderSize: renderSize, topInset: box.topInset))
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
    /// `onProgress` gets 0…1 about twice a second while the file is written:
    /// a long practice takes minutes to save, and a bare spinner that long
    /// looks frozen.
    private static func export(
        asset: AVAsset, videoComposition: AVVideoComposition?, audioMix: AVAudioMix?, to outputURL: URL,
        onProgress: ((Float) -> Void)? = nil
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
        let poll = onProgress.map { report in
            Task.detached {
                while !Task.isCancelled {
                    report(export.progress)
                    try? await Task.sleep(nanoseconds: 500_000_000)
                }
            }
        }
        defer { poll?.cancel() }
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
        streakLabel: String? = nil,
        beltLabel: String? = nil,
        menuName: String? = nil,
        decor: Decor = .none,
        onProgress: ((Float) -> Void)? = nil
    ) async throws -> ExportResult {
        let started = Date()
        // Keep the source asset in this local for the whole export: composition
        // tracks don't retain it.
        let source = AVURLAsset(url: sourceURL)
        // With echo-cancelled input the microphone no longer hears the music or
        // character voices, so they are mixed back in from the original files.
        // A failed mix still exports the recording with its overlay.
        let (asset, audioMix, result) = await mixedAsset(source: source, sounds: sounds, voice: voice)
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

        // Always built: even with no overlay events the video still carries
        // the streak pill and the family's decoration.
        let segs = segments(from: events, totalDurationMs: totalDurationMs)
        parentLayer.addSublayer(
            overlayLayer(segments: segs, totalDurationMs: totalDurationMs, renderSize: size,
                         menu: menu, beltLabel: beltLabel, menuName: menuName,
                         streakLabel: streakLabel, decor: decor)
        )
        composition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer, in: parentLayer
        )

        try await export(asset: asset, videoComposition: composition, audioMix: audioMix, to: outputURL,
                         onProgress: onProgress)
        withExtendedLifetime(source) {}
        print(String(format: "⚡️  [KarateRecorder] burn export %.1f s for %.1f s of video",
                     Date().timeIntervalSince(started), totalDurationMs / 1000))
        return result
    }

    /// The fallback when the overlay burn fails: the same sound mix into the raw
    /// video, with no overlay, so the family still gets a video with sound.
    /// Throws if there is nothing to mix or the mix itself fails.
    static func mixOnly(
        sourceURL: URL, outputURL: URL, sounds: [Sound], voice: VoiceTrack?,
        onProgress: ((Float) -> Void)? = nil
    ) async throws -> ExportResult {
        let source = AVURLAsset(url: sourceURL)
        let (asset, audioMix, result) = await mixedAsset(source: source, sounds: sounds, voice: voice)
        guard result.soundMixed else {
            throw CompositorError.exportFailed("no sound to mix: \(result.mixError ?? "nothing recorded")")
        }
        try await export(asset: asset, videoComposition: nil, audioMix: audioMix, to: outputURL,
                         onProgress: onProgress)
        withExtendedLifetime(source) {}
        return result
    }
}
