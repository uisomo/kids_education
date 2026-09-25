#if DEBUG
#if os(iOS)
import AVFoundation
import Foundation

/// ✨キラキラ の実機/シミュレータ確認。Release ビルドには入らない（`#if DEBUG`）。
///
/// カメラの前で空手をしてもらわなくても、パイプラインの壊れは見つかる:
///
/// 1. **本物どおり**: 動画 → Vision → MotionEngine → 書き出し。人が写っていない
///    動画なら anchors は 0 本で、かざりの無い mp4 が出るのが正解。落ちない・
///    音が残る・別ファイルになる、をここで見る。
/// 2. **絵が出るか**: 手首が動いている *作りものの* タイムラインを食わせて
///    書き出す。Vision を通さずに SceneBuilder → EffectPainter → CoreImage 合成
///    だけを確かめられるので、「輪が出ない」のが検出のせいか描画のせいかが分かる。
///
/// 使いかた:
/// ```
/// APP=$(xcrun simctl get_app_container booted com.alan.karate data)
/// cp sample.mp4 "$APP/tmp/motionfx-selftest.mp4"
/// SIMCTL_CHILD_MOTIONFX_SELFTEST=1 xcrun simctl launch --console booted com.alan.karate
/// ```
/// 実機なら Xcode の Scheme > Run > Arguments で `MOTIONFX_SELFTEST=1` を足す。
enum MotionEffectsSelfTest {
    static var isRequested: Bool {
        ProcessInfo.processInfo.environment["MOTIONFX_SELFTEST"] == "1"
    }

    static func runIfRequested() {
        guard isRequested else { return }
        guard #available(iOS 17.0, *) else {
            print("🧪 [MotionFX] needs iOS 17; skipped")
            return
        }
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("motionfx-selftest.mp4")
        guard FileManager.default.fileExists(atPath: source.path) else {
            print("🧪 [MotionFX] put a video at \(source.path) first")
            return
        }
        Task.detached(priority: .utility) { await run(source: source) }
    }

    @available(iOS 17.0, *)
    private static func run(source: URL) async {
        let mode = PracticeMode.karate
        print("🧪 [MotionFX] source: \(source.lastPathComponent)")

        // 1. 本物どおり（Vision あり）
        let started = Date()
        do {
            let output = try await MotionEffects.apply(
                sourceURL: source, mode: mode,
                presetID: MotionEffects.defaultPresetID[mode] ?? "quietLightning",
                intensity: 1,
                onProgress: { phase, fraction in
                    if Int(fraction * 100) % 25 == 0 { print("🧪 [MotionFX] \(phase) \(Int(fraction*100))%") }
                }
            )
            await describe(output, label: "real", source: source, since: started)
        } catch {
            print("🧪 [MotionFX] ❌ real run failed: \(error.localizedDescription)")
        }

        // 2. 絵が出るか（作りもののタイムライン）
        do {
            let geometry = try await VideoGeometry.load(AVURLAsset(url: source))
            let timeline = try syntheticTimeline(
                sourceID: try VideoIdentity.make(source),
                duration: geometry.duration.seconds,
                size: FXSize(Double(geometry.sourceSize.width), Double(geometry.sourceSize.height))
            )
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("motionfx-selftest-synthetic.mp4")
            try? FileManager.default.removeItem(at: destination)
            let output = try await VideoEffectsExporter.export(
                sourceURL: source, timeline: timeline, presetID: "quietLightning",
                destinationURL: destination
            )
            let sample = timeline.scene(at: min(1, timeline.duration / 2),
                                        preset: try EffectCatalog.bundled().preset("quietLightning")!)
            print("🧪 [MotionFX] synthetic scene has \(sample.primitives.count) primitive(s) mid-clip")
            await describe(output, label: "synthetic", source: source, since: started)
        } catch {
            print("🧪 [MotionFX] ❌ synthetic run failed: \(error.localizedDescription)")
        }
    }

    /// 手首が円を描き、0.8 秒ごとに「バースト」する作りものの観測列。
    private static func syntheticTimeline(sourceID: String, duration: Double, size: FXSize) throws -> EffectTimeline {
        let fps = 15.0
        var frames: [EffectFrame] = []
        var burst: Double?
        var time = 0.0
        while time < duration {
            if burst == nil || time - (burst ?? 0) > 0.8 { burst = time }
            let angle = time * 3
            let point = FXPoint(0.5 + 0.18 * cos(angle), 0.45 + 0.18 * sin(angle))
            frames.append(EffectFrame(
                time: time, generation: 0, sourceSize: size,
                anchors: [AnchorFrame(joint: .rightWrist, point: point,
                                      velocity: FXPoint(0.4, 0.4), energy: 0.8,
                                      confidence: 0.9, lastBurst: burst)]
            ))
            time += 1 / fps
        }
        return try EffectTimeline(sourceID: sourceID, mode: .karate, duration: duration, frames: frames)
    }

    private static func describe(_ output: URL, label: String, source: URL, since: Date) async {
        let fm = FileManager.default
        let bytes = (try? fm.attributesOfItem(atPath: output.path)[.size] as? Int) ?? 0
        let asset = AVURLAsset(url: output)
        let video = (try? await asset.loadTracks(withMediaType: .video))?.count ?? -1
        let audio = (try? await asset.loadTracks(withMediaType: .audio))?.count ?? -1
        let seconds = (try? await asset.load(.duration))?.seconds ?? 0
        let sourceIntact = fm.fileExists(atPath: source.path)
        print(String(format: "🧪 [MotionFX] %@: %@ — %.1f s, %d video / %d audio track(s), %d bytes, %.1f s elapsed, source intact: %@",
                     label, output.lastPathComponent, seconds, video, audio, bytes,
                     Date().timeIntervalSince(since), sourceIntact ? "yes" : "NO"))
    }
}
#endif
#endif
