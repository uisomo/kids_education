import Foundation
import AVFoundation
import CoreGraphics

let videoPath = CommandLine.arguments[1]
// 解析は かざりに関係ないので、2つめ以降の引数をぜんぶ描く（1回の解析を使い回す）。
let presetIDs = CommandLine.arguments.count > 2 ? Array(CommandLine.arguments.dropFirst(2)) : ["kiBlue"]
let tag = ProcessInfo.processInfo.environment["FXTAG"] ?? ""
let url = URL(fileURLWithPath: videoPath)
let catalog = try! JSONDecoder().decode(EffectCatalog.self, from: Data(contentsOf: URL(fileURLWithPath: "Effects.json")))
try! catalog.validate()
let presets = presetIDs.map { catalog.preset($0)! }
let config = TrackingConfiguration(mode: presets[0].mode)
let sem = DispatchSemaphore(value: 0)

// 🎹 ピアノのかざりは **音** から作る（アプリと同じ道: VideoMotionAnalyzer が
// mode を見て、音だけを聞く）。ここには何もロジックを置かない。
if presets[0].mode == .piano {
  Task {
    do {
      let start = Date()
      let timeline = try await VideoMotionAnalyzer.analyze(url: url, configuration: config)
      let onsets = timeline.audio.flatMap { $0.notes.filter(\.onset) }
      print(String(format: "🎹 音のコマ %d（%.1f秒ぶん・解析 %.1f秒） 鳴っているコマ %d  弾いた瞬間 %d 回",
                   timeline.audio.count, timeline.duration, Date().timeIntervalSince(start),
                   timeline.audio.filter { !$0.notes.isEmpty }.count, onsets.count))
      for preset in presets {
        var drawn = 0, total = 0, prims = 0
        var scored: [(Double, Int)] = []
        var t = 0.0
        while t <= timeline.duration {
          total += 1
          let scene = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
          if !scene.primitives.isEmpty { drawn += 1; prims += scene.primitives.count; scored.append((t, scene.primitives.count)) }
          t += 1.0/30.0
        }
        print("\n\(preset.id) (\(preset.name)) style=\(preset.style)")
        print("  何か出ているコマ \(drawn)/\(total) (\(Int(Double(drawn)/Double(max(1,total))*100))%)、\(prims) 本")
        scored.sort { $0.1 > $1.1 }
        var picks: [Double] = []
        for s in scored where picks.allSatisfy({ abs($0-s.0) > 1.5 }) { picks.append(s.0); if picks.count == 4 { break } }
        renderProof(video: url, timeline: timeline, preset: preset, catalog: catalog,
                    times: picks.sorted(), outDir: URL(fileURLWithPath: "proof"), tag: preset.id+tag)
        if let from = ProcessInfo.processInfo.environment["FXCLIP"].flatMap(Double.init) {
          renderClip(video: url, timeline: timeline, preset: preset, catalog: catalog,
                     start: from, seconds: 3, fps: 15, outDir: URL(fileURLWithPath: "proof"), tag: preset.id+tag)
        }
      }
    } catch { print("FAILED: \(error)") }
    sem.signal()
  }
  sem.wait()
  exit(0)
}

Task {
  do {
    let timeline = try await VideoMotionAnalyzer.analyze(url: url, configuration: config)
    let frames = timeline.frames
    print("TIMELINE: \(frames.count) frames / \(String(format:"%.1f",timeline.duration))s")
    print("  frames with an anchor: \(frames.filter { !$0.anchors.isEmpty }.count)")
    var bursts = Set<Double>()
    for f in frames { for a in f.anchors { if let b = a.lastBurst { bursts.insert((b*100).rounded()/100) } } }
    print("  distinct bursts: \(bursts.count)")
    print("  骨（腕/脚）が取れたコマ: \(frames.filter { !$0.limbs.isEmpty }.count)")
    // 🦵 脚は出ているか。エンジンは足首を見ているが、かざりが描かれるのは
    // 「エネルギーの高い順に maxAnchors 本」なので、腕に負けると出ない。
    let armFrames = frames.filter { $0.limbs.contains { $0.kind == .arm } }.count
    let legFrames = frames.filter { $0.limbs.contains { $0.kind == .leg } }.count
    var legDrawn = 0, legEnergyMax = 0.0
    for f in frames {
        let usable = f.limbs.filter { $0.energy > 0.05 && $0.root.inUnitSquare && $0.mid.inUnitSquare && $0.tip.inUnitSquare }
            .sorted { $0.energy > $1.energy }.prefix(2)
        if usable.contains(where: { $0.kind == .leg }) { legDrawn += 1 }
        legEnergyMax = max(legEnergyMax, f.limbs.filter { $0.kind == .leg }.map(\.energy).max() ?? 0)
    }
    print("  🦵 脚の骨が取れたコマ \(legFrames)（腕 \(armFrames)）/ 上位2本に入って **描かれた** コマ \(legDrawn)"
          + String(format: "  脚のエネルギー最大 %.2f", legEnergyMax))
    let ankles = frames.flatMap { $0.anchors.filter { $0.joint.isFoot } }
    print("  🦵 足首のアンカー \(ankles.count) こ（うち 信頼度0.5以上 \(ankles.filter { $0.confidence >= 0.5 }.count)）")
    // FXDUMP=<秒> で、その前後 0.4 秒の骨とアンカーの座標を出す。
    // 「なぜ そこに かざりが出るのか」は、目で見ても分からない。
    if let at = ProcessInfo.processInfo.environment["FXDUMP"].flatMap(Double.init) {
      for f in frames where abs(f.time-at) < 0.4 {
        let limbs = f.limbs.map { String(format: "%@ root(%.2f,%.2f) mid(%.2f,%.2f) tip(%.2f,%.2f) e=%.2f",
          $0.joint.rawValue, $0.root.x, $0.root.y, $0.mid.x, $0.mid.y, $0.tip.x, $0.tip.y, $0.energy) }
        let anchors = f.anchors.map { String(format: "%@(%.2f,%.2f) e=%.2f c=%.2f",
          $0.joint.rawValue, $0.point.x, $0.point.y, $0.energy, $0.confidence) }
        print(String(format: "  t=%.2f gen=%d", f.time, f.generation))
        for l in limbs { print("     limb \(l)") }
        for a in anchors { print("     anch \(a)") }
      }
    }
    for preset in presets {
      var drawn = 0, total = 0, prims = 0, limbFrames = 0, orbFrames = 0, airFrames = 0
      var scored: [(Double, Int)] = []
      var t = 0.0
      while t <= timeline.duration {
        total += 1
        let s = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
        // 背景（その場所の空気）は先頭に並んでいる。**数えものからは外す** —
        // 空気はほぼ全コマに出るので、混ぜると「かざりが出ているか」が見えなくなる。
        if s.ambientCount > 0 { airFrames += 1 }
        let fx = Array(s.primitives.dropFirst(s.ambientCount))
        if !fx.isEmpty {
          drawn += 1; prims += fx.count; scored.append((t, fx.count))
          // 腕まわりのかざりが出ているコマ（こぶしの光と衝撃波は数えない）
          if fx.contains(where: {
            ($0.kind == .glow || $0.kind == .ribbon) && $0.points.count > 4 || $0.kind == .spray
          }) { limbFrames += 1 }
          if fx.contains(where: { $0.kind == .orb }) { orbFrames += 1 }
        }
        t += 1.0/30.0
      }
      print("\n\(preset.id) (\(preset.name)) style=\(preset.style)")
      print("  drawn on \(drawn)/\(total) output frames (\(Int(Double(drawn)/Double(total)*100))%), \(prims) primitives")
      print("  こぶしが光るコマ \(orbFrames)  **腕にまとわりつくコマ \(limbFrames)** = \(String(format: "%.1f", Double(limbFrames)/30.0)) 秒ぶん")
      print("  背景（その場所の空気）が出ているコマ \(airFrames)/\(total) (\(Int(Double(airFrames)/Double(total)*100))%)")
      var picks: [Double] = []
      if let b = bursts.sorted().dropFirst(2).first { picks.append(b + 0.10) }
      scored.sort { $0.1 > $1.1 }
      for s in scored where picks.allSatisfy({ abs($0 - s.0) > 1.5 }) { picks.append(s.0); if picks.count == 4 { break } }
      renderProof(video: url, timeline: timeline, preset: preset, catalog: catalog,
                  times: picks.sorted(), outDir: URL(fileURLWithPath: "proof"), tag: preset.id + tag)
      // FXCLIP=<開始秒> で、動く絵（GIF）も出す。回るものは静止画では確かめられない。
      if let from = ProcessInfo.processInfo.environment["FXCLIP"].flatMap(Double.init) {
        renderClip(video: url, timeline: timeline, preset: preset, catalog: catalog,
                   start: from, seconds: 3, fps: 15,
                   outDir: URL(fileURLWithPath: "proof"), tag: preset.id + tag)
      }
    }
  } catch { print("FAILED: \(error)") }
  sem.signal()
}
sem.wait()
