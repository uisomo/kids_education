import Foundation
import AVFoundation

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
Task {
  do {
    let timeline = try await VideoMotionAnalyzer.analyze(url: url, configuration: config)
    let frames = timeline.frames
    print("TIMELINE: \(frames.count) frames / \(String(format:"%.1f",timeline.duration))s")
    print("  frames with an anchor: \(frames.filter { !$0.anchors.isEmpty }.count)")
    var bursts = Set<Double>()
    for f in frames { for a in f.anchors { if let b = a.lastBurst { bursts.insert((b*100).rounded()/100) } } }
    print("  distinct bursts: \(bursts.count)")
    for preset in presets {
      var drawn = 0, total = 0, prims = 0, glyphFrames = 0, ringFrames = 0
      var scored: [(Double, Int)] = []
      var t = 0.0
      while t <= timeline.duration {
        total += 1
        let s = timeline.scene(at: t, preset: preset, intensity: 1, reduceMotion: false)
        if !s.primitives.isEmpty {
          drawn += 1; prims += s.primitives.count; scored.append((t, s.primitives.count))
          if s.primitives.contains(where: { $0.kind == .glyph }) { glyphFrames += 1 }
          if s.primitives.contains(where: { $0.kind == .ring || $0.kind == .orb }) { ringFrames += 1 }
        }
        t += 1.0/30.0
      }
      print("\n\(preset.id) (\(preset.name)) style=\(preset.style)")
      print("  drawn on \(drawn)/\(total) output frames (\(Int(Double(drawn)/Double(total)*100))%), \(prims) primitives")
      print("  輪/たまが見えるコマ \(ringFrames)  印が見えるコマ \(glyphFrames) = \(String(format: "%.1f", Double(glyphFrames)/30.0)) 秒ぶん")
      var picks: [Double] = []
      if let b = bursts.sorted().dropFirst(2).first { picks.append(b + 0.10) }
      scored.sort { $0.1 > $1.1 }
      for s in scored where picks.allSatisfy({ abs($0 - s.0) > 1.5 }) { picks.append(s.0); if picks.count == 4 { break } }
      renderProof(video: url, timeline: timeline, preset: preset, catalog: catalog,
                  times: picks.sorted(), outDir: URL(fileURLWithPath: "proof"), tag: preset.id + tag)
    }
  } catch { print("FAILED: \(error)") }
  sem.signal()
}
sem.wait()
