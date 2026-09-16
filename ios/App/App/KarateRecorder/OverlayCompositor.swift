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
        /// The 工夫 panel's own bottom edge: Alan's badge sits in the same
        /// corner, so that one panel is lifted over him.
        var kufuBottom: CGFloat? = nil
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

    private static func style(for region: Region) -> Style {
        switch region {
        case .drill:
            return Style(centerX: 0.5, centerY: 90 / designHeight, fontPx: 44,
                         color: .white,
                         background: boxTop, backgroundEnd: boxBottom,
                         stroke: gold.withAlphaComponent(0.55))
        case .seconds:
            return Style(centerX: 0.5, centerY: 230 / designHeight, fontPx: 150,
                         color: UIColor(red: 1, green: 0xd1 / 255, blue: 0x66 / 255, alpha: 1),
                         background: UIColor(white: 0, alpha: 0.55), outlined: true)
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
        // Room around the box for its drop shadow.
        let margin = style.outlined ? 0 : ceil(fontSize * 0.3)
        let imageSize = CGSize(width: boxW + margin * 2, height: boxH + margin * 2)
        let image = UIGraphicsImageRenderer(size: imageSize, format: format).image { ctx in
            if !style.outlined {
                drawBox(CGRect(x: margin, y: margin, width: boxW, height: boxH),
                        radius: fontSize * 0.34,
                        top: style.background, bottom: style.backgroundEnd,
                        stroke: style.stroke, strokeWidth: max(1, 2 * fontScale),
                        shadow: margin, in: ctx.cgContext)
            }
            attributed.draw(at: CGPoint(
                x: margin + (boxW - textSize.width) / 2,
                y: margin + (boxH - textSize.height) / 2
            ))
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

    /// The whole session's menu with each drill's length in seconds, so anyone
    /// watching the video can follow the practice. The running drill is
    /// highlighted, finished ones are dimmed. Anchored bottom-left above the
    /// 工夫 caption, over the body rather than the face.
    private static func menuPanelLayer(
        menu: [MenuItem], activeIndex: Int, renderSize: CGSize, beltLabel: String? = nil,
        bottomY: CGFloat = defaultPanelBottom, sideInset: CGFloat = 24
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

        let yellow = gold
        let titleFont = playfulFont(26 * scale)
        let rowFont = playfulFont(rowH * 0.66, heavy: false)

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
                    top: boxTop, bottom: boxBottom,
                    stroke: gold.withAlphaComponent(0.45), strokeWidth: max(1, 1.5 * scale),
                    in: ctx.cgContext)

            // 「特訓一覧  🟢 緑帯」 — the belt of the saved menu being practiced.
            let title = beltLabel.map { "特訓一覧  \($0)" } ?? "特訓一覧"
            NSAttributedString(string: title, attributes: [
                .font: titleFont, .foregroundColor: yellow, .paragraphStyle: truncating,
            ]).draw(in: CGRect(x: pad, y: pad, width: width - pad * 2, height: titleH))

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
        sideInset: CGFloat = 24
    ) -> CALayer {
        let scale = min(renderSize.width / designWidth, renderSize.height / designHeight)
        let pad = 16 * scale
        let width = 300 * scale
        let titleFont = playfulFont(24 * scale)
        let bodyFont = playfulFont(27 * scale, heavy: false)

        let wrapping = NSMutableParagraphStyle()
        wrapping.lineBreakMode = .byTruncatingTail
        wrapping.lineSpacing = 3 * scale
        let title = NSAttributedString(string: "💡 工夫", attributes: [
            .font: titleFont, .foregroundColor: gold,
        ])
        let body = NSAttributedString(string: text, attributes: [
            .font: bodyFont, .foregroundColor: UIColor.white, .paragraphStyle: wrapping,
        ])

        // Five lines at most, so a long 工夫 can never run up over the face.
        let textWidth = width - pad * 2
        let maxBodyH = ceil(bodyFont.lineHeight * 5 + wrapping.lineSpacing * 4)
        let bodyH = min(maxBodyH, ceil(body.boundingRect(
            with: CGSize(width: textWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
        ).height))
        let titleH = ceil(titleFont.lineHeight)
        let gap = 8 * scale
        let height = ceil(pad * 2 + titleH + gap + bodyH)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height), format: format
        ).image { ctx in
            drawBox(CGRect(x: 0, y: 0, width: width, height: height), radius: 18 * scale,
                    top: boxTop, bottom: boxBottom,
                    stroke: gold.withAlphaComponent(0.45), strokeWidth: max(1, 1.5 * scale),
                    in: ctx.cgContext)
            title.draw(in: CGRect(x: pad, y: pad, width: textWidth, height: titleH))
            body.draw(with: CGRect(x: pad, y: pad + titleH + gap, width: textWidth, height: bodyH),
                      options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
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
            // bottom, so every label and panel moves in past it.
            return Layout(topInset: 190, sideInset: 70, panelBottom: 1175)
        case .icon:
            // Bottom-right, out of the drill name's way — it is centred at the
            // top and a long name reaches well into the corner up there.
            return Layout(kufuBottom: iconBottom - iconSide - 14)
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

    /// Builds the overlay layer tree for the whole session.
    static func overlayLayer(
        segments: [Segment], totalDurationMs: Double, renderSize: CGSize,
        menu: [MenuItem] = [], beltLabel: String? = nil, streakLabel: String? = nil,
        decor: Decor = .none
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

        if !menu.isEmpty {
            for (index, spans) in menuWindows(in: segments) {
                let panel = menuPanelLayer(menu: menu, activeIndex: index, renderSize: renderSize,
                                           beltLabel: beltLabel, bottomY: box.panelBottom,
                                           sideInset: box.sideInset)
                applyVisibility(to: panel, windows: spans, totalMs: totalDurationMs)
                container.addSublayer(panel)
            }
        }

        for region in Region.allCases {
            for (text, spans) in windows(in: segments, region: region) {
                // 工夫 is a panel on the right, not a line of text in a pill.
                let layer: CALayer
                if region == .caption {
                    layer = kufuPanelLayer(text: text, renderSize: renderSize,
                                           bottomY: box.kufuBottom ?? box.panelBottom,
                                           sideInset: box.sideInset)
                } else {
                    var itemStyle = style(for: region, text: text)
                    // Only the labels hung from the top move for the frame; the
                    // cue and the countdown sit in the middle of the picture.
                    if region == .drill || region == .seconds {
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
        streakLabel: String? = nil,
        beltLabel: String? = nil,
        decor: Decor = .none
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
                         menu: menu, beltLabel: beltLabel, streakLabel: streakLabel, decor: decor)
        )
        composition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer, in: parentLayer
        )

        try await export(asset: asset, videoComposition: composition, audioMix: audioMix, to: outputURL)
        withExtendedLifetime(source) {}
        print(String(format: "⚡️  [KarateRecorder] burn export %.1f s for %.1f s of video",
                     Date().timeIntervalSince(started), totalDurationMs / 1000))
        return result
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
