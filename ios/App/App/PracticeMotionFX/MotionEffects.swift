#if os(iOS)
import AVFoundation
import Foundation
import UIKit

/// ✨キラキラ — PracticeMotionFX をこのアプリにつなぐ層。
///
/// 仕上がった動画（overlay を焼き込んで音を混ぜた、いつもの保存済みファイル）を
/// **読むだけ** で、手首・足首の動きに合わせた細い輪郭のかざりを乗せた
/// *別ファイル* を作る。元の動画は絶対に書き換えない。家族が「もとの動画」に
/// 戻せるよう、両方のパスを JS 側に返す。
///
/// - 録画そのもの（CameraSession / AVCaptureMovieFileOutput）には一切触らない。
/// - カメラ中のライブ表示はしない（上流の Live ファイルは取り込んでいない）。
/// - 通信もアップロードも無い。解析結果は端末内の JSON（sidecar）だけ。
///
/// iOS 17 未満では `isSupported == false` になり、JS はボタンを出さない。
enum MotionEffects {

    // MARK: - 使えるかどうか / プリセット

    static var isSupported: Bool {
        if #available(iOS 17.0, *) { return true }
        return false
    }

    /// 「ふつうは これ」。家族には名前しか見せないので、日本語名はここで持つ。
    static let defaultPresetID: [PracticeMode: String] = [
        .karate: "quietLightning",
        .piano: "pianoPearl",
    ]

    /// カタログの英語名は画面に出さない。子どもが読める短い日本語にする。
    private static let japaneseNames: [String: String] = [
        "quietLightning": "⚡️ いなずま",
        "mintHalo": "🟢 わっか",
        "ribbonTrail": "💜 リボン",
        "softKick": "🧡 けりのこ",
        "pianoPearl": "🤍 しんじゅ",
        "pianoNotes": "🎵 おんぷ",
    ]

    /// その練習（空手 / ピアノ）で選べるかざり。既定が先頭。
    static func presets(for mode: PracticeMode) -> [[String: Any]] {
        guard let catalog = try? EffectCatalog.bundled() else { return [] }
        let wanted = defaultPresetID[mode]
        return catalog.presets
            .filter { $0.mode == mode }
            .sorted { a, b in
                if (a.id == wanted) != (b.id == wanted) { return a.id == wanted }
                return false
            }
            .map { ["id": $0.id, "name": japaneseNames[$0.id] ?? $0.name] }
    }

    // MARK: - エラー

    enum EffectsError: LocalizedError {
        case unsupportedOS
        case busy
        case missingSource
        case tooLong(Double)

        var errorDescription: String? {
            switch self {
            case .unsupportedOS: return "この iPhone ではキラキラを付けられません（iOS 17 以上が必要です）"
            case .busy: return "いまキラキラを作っています"
            case .missingSource: return "動画が見つかりませんでした"
            case .tooLong(let minutes):
                return String(format: "長い練習（%.0f分以上）にはキラキラを付けられません", minutes)
            }
        }
    }

    /// 解析の上限。既定の 15 分だと長めの稽古が弾かれるので 30 分まで許す。
    /// これを超えたら、黙って失敗させずに理由を返す。
    private static let maximumSeconds: Double = 1800

    // MARK: - 置き場所

    /// 解析結果（sidecar JSON）。tmp ではなく Application Support：もう一度
    /// 同じ動画にかざりを付け直すとき、解析をやり直さずに済む。
    private static let sidecarDirectory: URL = {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("KarateRecorder/motionfx", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = dir
        try? mutable.setResourceValues(values)
        return dir
    }()

    /// 同じファイルかどうかの当たり。中身のハッシュはパッケージ側が別に取る
    /// （sourceID）ので、ここは「解析をやり直すかどうか」の目安でよい。
    private static func sidecarURL(for source: URL, mode: PracticeMode) throws -> URL {
        let values = try source.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        let size = values.fileSize ?? 0
        let stamp = Int((values.contentModificationDate ?? .distantPast).timeIntervalSince1970 * 1000)
        let base = source.deletingPathExtension().lastPathComponent
        return sidecarDirectory.appendingPathComponent("\(base)-\(size)-\(stamp)-\(mode.rawValue).json")
    }

    /// できあがりの置き場所。元の動画の隣（tmp）に、プリセット名を付けて。
    /// 同じ名前が既にあれば作り直さずそれを返す（スライダーを触るたびに
    /// 何分もかかる書き出しが走るのを防ぐ）。
    private static func outputURL(for source: URL, presetID: String, intensity: Int) -> URL {
        let base = source.deletingPathExtension().lastPathComponent
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("\(base)-fx-\(presetID)-\(intensity).mp4")
    }

    // MARK: - 進み具合のならし

    /// 書き出しの進み具合を、子どもが見ても変じゃない形にして流す。
    ///
    /// `AVAssetExportSession.progress` は、書き出しが **始まる前** に 1.0 を
    /// 返すことがある。そのまま出すと「つけているよ… 100%」が一瞬光って
    /// 55% に戻る。最初の 1.0 は本物の値が来るまで捨て、そのあとは数字が
    /// 後ろに戻らないようにする。
    private final class ProgressFilter: @unchecked Sendable {
        private let lock = NSLock()
        private var sawRealSample = false
        private var highest = 0.0

        /// 流してよい値。捨てるときは nil。
        func admit(_ fraction: Double) -> Double? {
            lock.lock(); defer { lock.unlock() }
            if !sawRealSample {
                guard fraction < 1 else { return nil }
                sawRealSample = true
            }
            guard fraction >= highest else { return nil }
            highest = fraction
            return fraction
        }
    }

    // MARK: - 実行（1本ずつ）

    /// 走っている仕事。2本同時に走らせない：Vision も書き出しも重く、
    /// 保存中の動画と GPU を取り合うと、どちらも遅くなる。
    private actor Runner {
        static let shared = Runner()
        private var current: Task<URL, Error>?

        func run(_ body: @escaping @Sendable () async throws -> URL) throws -> Task<URL, Error> {
            guard current == nil else { throw EffectsError.busy }
            let task = Task(priority: .userInitiated) { try await body() }
            current = task
            return task
        }

        func finish() { current = nil }
        func cancel() { current?.cancel(); current = nil }
        var isRunning: Bool { current != nil }
    }

    static func cancel() async { await Runner.shared.cancel() }
    static func isRunning() async -> Bool { await Runner.shared.isRunning }

    /// 仕上がった動画にかざりを付けた **新しい** mp4 を作る。
    ///
    /// - Parameters:
    ///   - sourceURL: 保存済みの練習動画（この関数は読むだけ）
    ///   - mode: 空手なら体のポーズ、ピアノなら手のポーズを見る
    ///   - presetID: `presets(for:)` の id
    ///   - intensity: 0…1。0 でかざり無し（= もとの動画と同じ絵）
    ///   - onProgress: 0…1（解析 0→0.55、書き出し 0.55→1）
    @available(iOS 17.0, *)
    static func apply(
        sourceURL: URL,
        mode: PracticeMode,
        presetID: String,
        intensity: Double,
        onProgress: @escaping @Sendable (String, Double) -> Void
    ) async throws -> URL {
        let fm = FileManager.default
        guard fm.fileExists(atPath: sourceURL.path) else { throw EffectsError.missingSource }

        // 「動きを減らす」を入れている家族には、輪だけの静かな絵にする。
        let reduceMotion = await MainActor.run { UIAccessibility.isReduceMotionEnabled }
        let clamped = min(1, max(0, intensity))
        let bucket = Int((clamped * 100).rounded())
        let output = outputURL(for: sourceURL, presetID: presetID, intensity: bucket)

        // 同じ組み合わせで既に作ってあれば、それをそのまま。
        if fm.fileExists(atPath: output.path) {
            onProgress("exporting", 1)
            return output
        }

        let started = Date()
        let exportProgress = ProgressFilter()
        let task = try await Runner.shared.run {
            defer { Task { await Runner.shared.finish() } }
            let timeline = try await loadOrAnalyze(
                sourceURL: sourceURL, mode: mode,
                onProgress: { onProgress("analyzing", $0 * 0.55) }
            )
            try Task.checkCancellation()
            // 上書きは絶対にしない決まりなので、書き出す直前に場所を空ける。
            // 消すのは自分が作った "-fx-" ファイルだけ。
            try? fm.removeItem(at: output)
            let configuration = EffectsExportConfiguration(
                maximumLongEdge: 1920,
                framesPerSecond: nil,
                intensity: clamped,
                reduceMotion: reduceMotion
            )
            return try await VideoEffectsExporter.export(
                sourceURL: sourceURL, timeline: timeline, presetID: presetID,
                destinationURL: output, configuration: configuration,
                progress: { report in
                    guard let fraction = exportProgress.admit(report.fraction) else { return }
                    onProgress("exporting", 0.55 + fraction * 0.45)
                }
            )
        }
        do {
            let url = try await task.value
            onProgress("exporting", 1)
            // 実機での実測値。ハンドオフが求めている「目標値ではなく測った値」は
            // この行から拾う。
            print(String(format: "⚡️  [MotionFX] %@ done in %.1f s", presetID, Date().timeIntervalSince(started)))
            return url
        } catch {
            try? fm.removeItem(at: output)
            throw error
        }
    }

    /// 解析結果があれば読む、無ければ取り直す。読めたものが別の動画の
    /// ものだった場合はパッケージ側が書き出しで弾くので、ここでは
    /// 明らかに壊れているものだけ捨てる。
    @available(iOS 17.0, *)
    private static func loadOrAnalyze(
        sourceURL: URL, mode: PracticeMode,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> EffectTimeline {
        let sidecar = try? sidecarURL(for: sourceURL, mode: mode)
        if let sidecar, let cached = try? EffectTimeline.load(from: sidecar), cached.mode == mode {
            print("⚡️  [MotionFX] reusing the saved motion timeline")
            onProgress(1)
            return cached
        }
        let configuration = TrackingConfiguration(mode: mode)
        let timeline = try await VideoMotionAnalyzer.analyze(
            url: sourceURL, configuration: configuration, maximumDuration: maximumSeconds,
            progress: { onProgress($0.fraction) }
        )
        if let sidecar {
            do { try timeline.save(to: sidecar) }
            catch { print("⚡️  [MotionFX] could not keep the timeline: \(error.localizedDescription)") }
        }
        return timeline
    }

    /// 動画が消えたあとに解析結果だけ残らないように。練習の始めに呼ぶ。
    static func removeOrphanedSidecars(keeping keep: Set<String>) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: sidecarDirectory.path) else { return }
        let stale = names.filter { name in
            // 名前の先頭は元動画のベース名。まだ使う動画のものは残す。
            !keep.contains(where: { name.hasPrefix($0) })
        }
        guard !stale.isEmpty else { return }
        DispatchQueue.global(qos: .utility).async {
            for name in stale { try? fm.removeItem(at: sidecarDirectory.appendingPathComponent(name)) }
            print("⚡️  [MotionFX] removed \(stale.count) old motion timeline(s)")
        }
    }
}
#endif
