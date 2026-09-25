#if os(iOS)
import AVFoundation
import Foundation
import QuartzCore
import UIKit
import Vision

/// Vision のポーズ判定は、**その端末で初めて使うとき** にモデルを読み込む。
/// 実機（iPhone 16）で測ったら、その1コマだけ 7.1 秒かかった。
///
/// 放っておくと連鎖して悪くなる: TrackingBudget はその 7106ms を見て
/// 「この端末は遅い」と判断し、追跡を 2fps まで落とす。平均が下がるのは
/// ゆっくりなので、立ち直るまで十数秒 — 短い稽古なら前半まるごと、
/// ほとんど追跡できないまま終わる。
///
/// なのでプレビューを出した時点で、小さな空の絵で一度だけ空回ししておく。
/// 読み込みは カウントダウン（3・2・1・はじめ）の裏で終わる。
/// `static let` はスレッド安全に1回だけ走るので、鍵はいらない。
private enum VisionWarmUp {
    private static let body: Void = run(VNDetectHumanBodyPoseRequest())
    private static let hand: Void = run(VNDetectHumanHandPoseRequest())

    static func start(for mode: PracticeMode) {
        DispatchQueue.global(qos: .utility).async {
            let started = CACurrentMediaTime()
            _ = mode == .karate ? body : hand
            let seconds = CACurrentMediaTime() - started
            // 0秒ちょうどなら、もう読み込み済みだったということ。
            if seconds > 0.05 {
                print(String(format: "⚡️  [MotionFX] live: vision model loaded in %.1f s", seconds))
            }
        }
    }

    private static func run(_ request: VNRequest) {
        var buffer: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, 128, 128, kCVPixelFormatType_32BGRA,
                                  nil, &buffer) == kCVReturnSuccess, let buffer else { return }
        // 人は写っていない。ここで欲しいのは「見つけること」ではなく、
        // モデルがメモリに載ることだけ。
        try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
            .perform([request])
    }
}

/// ✨キラキラ（稽古中）— **画面にだけ** 出すかざり。
///
/// ここが何をして、何をしないか:
///
/// - 録画には **入らない**。録っているのは `AVCaptureMovieFileOutput` で、
///   カメラの絵をそのままファイルに書く。画面に重ねたものは保存される動画には
///   一切入らない。保存動画のキラキラは、いままでどおり稽古のあとに
///   `MotionEffects` が別ファイルとして作る。見えていたものと保存されたものが
///   ぴったり同じにならないのは、そのため（別々に解析している）。
/// - 録画を待たせない。解析は 1 コマだけ受け取り、返事を待たずに次へ進む。
///   `submit` が false を返しても、そのコマはちゃんと録画されている。
/// - 熱くなったり低電力モードになったら、解析の回数を減らし、ひどければ
///   消える。**録画だけは止めない。**
///
/// 座標: 解析用の出力にもプレビューと同じ 90°回転と左右反転をかけてあるので、
/// Vision が見る絵は子どもが見ている絵と同じ。だからここで反転を掛け直さない
/// （`mirrored: false`）。二重に掛けると、かざりが左右逆の手に出る。
@MainActor
final class LiveMotionOverlay {

    /// プレビューの上に乗せる透明なビュー。当たり判定は持たない。
    let view: MotionOverlayView

    private let tracker: LiveMotionTracker
    private let model = LiveEffectsModel()
    private let preset: EffectPreset
    private let intensity: Double
    private let reduceMotion: Bool
    private var link: CADisplayLink?
    /// 直前に描いた絵。同じなら描き直さない（じっとしている間は 0 回）。
    private var shown = EffectScene(sourceSize: FXSize(1, 1))

    /// 実機で測るための集計。2 秒ごとに 1 行だけ出す。
    private var windowStart = CACurrentMediaTime()
    private var windowFrames = 0
    private var windowMilliseconds = 0.0
    private var windowSkipped = 0
    private var windowAnchors = 0
    private var windowHeads = 0
    private var windowBestConfidence = 0.0
    private var windowSize = FXSize(0, 0)
    private var windowDrawn = 0

    /// `presetID` がこの練習の種類（空手/ピアノ）に合わないときは nil。
    init?(mode: PracticeMode, presetID: String, intensity: Double = 1) {
        guard let catalog = try? EffectCatalog.bundled(),
              let preset = catalog.preset(presetID), preset.mode == mode else {
            print("⚡️  [MotionFX] live: no such preset \(presetID) for \(mode.rawValue)")
            return nil
        }
        self.preset = preset
        self.intensity = min(1, max(0, intensity))
        self.reduceMotion = UIAccessibility.isReduceMotionEnabled
        view = MotionOverlayView(catalog: catalog)
        // プレビューは resizeAspectFill。合わせないと、かざりが体からずれる。
        view.videoContentMode = .fill
        view.isVideoMirrored = false

        var receive: (@MainActor (LiveTrackingUpdate) -> Void)!
        // 実機で測って決めた設定（既定は 640px / 信頼度 0.45）:
        //
        // - 960px: 手首は絵の中で小さい。体は見つかるのに手首だけ取れない、
        //   という状態が実機で出た。1コマ 14ms しかかかっておらず予算に
        //   余裕があるので、解像度に回す。
        // - 0.25: いまは「どれくらいの信頼度で取れているのか」を測っている
        //   ところ。下げた結果を confidence としてログに出し、最終的な値は
        //   その分布を見てから決める。低いままにはしない —
        //   確信の無い点に描くより、出さないほうがいい。
        let configuration = TrackingConfiguration(mode: mode, longestAnalysisEdge: 960,
                                                  minimumConfidence: 0.25)
        tracker = LiveMotionTracker(configuration: configuration) { update in
            Task { @MainActor in receive(update) }
        }
        receive = { [weak self] update in
            guard let self else { return }
            self.model.receive(update)
            // 描くかどうかとは別に、届くたびに数える。追跡が何も見つけて
            // いないときも「動いてはいる」と分かるようにするため。
            self.note(update)
        }
    }

    // MARK: - カメラから

    /// カメラのコマを渡す。**すぐ返る。** 戻り値は捨ててよく、録画は
    /// この結果に一切依存しない。
    nonisolated func submit(_ sampleBuffer: CMSampleBuffer) {
        // 解析用の出力を回転・反転させてあるので、Vision にはそのまま渡す。
        tracker.submit(sampleBuffer, orientation: .up)
    }

    // MARK: - 出したり消したり

    func start() {
        guard link == nil else { return }
        tracker.setEnabled(true)
        // 稽古が始まる前に読ませる。ここを踏まないと最初の1コマが数秒かかり、
        // 予算が追跡を 2fps まで落としてしまう。
        VisionWarmUp.start(for: preset.mode)
        print("⚡️  [MotionFX] live: started (\(preset.id), intensity \(intensity))")
        let link = CADisplayLink(target: self, selector: #selector(tick))
        // 30fps。録画とカメラに回す分を残す。
        link.preferredFramesPerSecond = 30
        link.add(to: .main, forMode: .common)
        self.link = link
        windowStart = CACurrentMediaTime()
    }

    /// カメラが止まった・中断された・画面を離れたとき。古いポーズが
    /// 画面に残らないように、必ず消してから止める。
    func stop() {
        tracker.setEnabled(false)
        link?.invalidate()
        link = nil
        model.clear()
        shown = EffectScene(sourceSize: FXSize(1, 1))
        view.scene = shown
    }

    @objc private func tick() {
        let scene = model.scene(preset: preset, intensity: intensity, reduceMotion: reduceMotion)
        // 同じ絵なら描き直さない: 画面いっぱいの透明レイヤーを毎コマ塗り直すのは
        // 高い。じっとしている間は 1 回描いたきりになる。
        guard scene != shown else { return }
        shown = scene
        view.scene = scene
        windowDrawn += 1
    }

    /// 実測値。目標値ではなく、この iPhone が実際に出した数字。追跡が何も
    /// 見つけていなくても出る（anchors 0 と分かるほうが、無言より役に立つ）。
    private func note(_ update: LiveTrackingUpdate) {
        windowFrames += 1
        windowMilliseconds += update.processingMilliseconds
        windowAnchors += update.frame.anchors.count
        // 体そのものが見つかっているか。頭の除外範囲は鼻か首から作られるので、
        // これが出ていれば「人は見えているが手首が取れていない」、出ていなければ
        // 「そもそも人を見つけていない」と分かる。
        if update.frame.headExclusion != nil { windowHeads += 1 }
        // 取れた手首/足首が、どれくらいの確からしさだったか。しきい値を
        // いくつにすべきかは、これを見てから決める。
        for anchor in update.frame.anchors { windowBestConfidence = max(windowBestConfidence, anchor.confidence) }
        windowSize = update.frame.sourceSize
        windowSkipped = update.skippedFrames
        if let error = update.errorDescription { print("⚡️  [MotionFX] live: \(error)") }
        let now = CACurrentMediaTime()
        guard now - windowStart >= 2 else { return }
        // size は Vision に渡している絵の向き。縦長でなければ回転が効いておらず、
        // 横倒しの絵を見せていることになる（それだと人はまず見つからない）。
        print(String(format: "⚡️  [MotionFX] live: %.1f fps tracked (%.0f allowed), %.1f ms/frame, %.1f anchors (best %.2f), %d/%d with a body, size %.0fx%.0f, %d drawn, %d skipped, thermal %d",
                     Double(windowFrames) / (now - windowStart), update.effectiveTrackingFPS,
                     windowMilliseconds / Double(max(1, windowFrames)),
                     Double(windowAnchors) / Double(max(1, windowFrames)), windowBestConfidence,
                     windowHeads, windowFrames,
                     windowSize.width, windowSize.height,
                     windowDrawn, windowSkipped,
                     ProcessInfo.processInfo.thermalState.rawValue))
        windowStart = now
        windowFrames = 0
        windowMilliseconds = 0
        windowAnchors = 0
        windowHeads = 0
        windowBestConfidence = 0
        windowDrawn = 0
    }
}
#endif
