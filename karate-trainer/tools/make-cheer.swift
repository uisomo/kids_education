// Cuts a green-screen talking-head video into one cheer clip per phrase, the
// format CHARACTERS[id].cheerClips expects: <prefix>-N.mov (256x256 HEVC with
// alpha, no sound, played muted) and <prefix>-N.m4a (mono 44.1 kHz AAC, the
// same range, played by the native engine). Both start at the same instant so
// the mouth stays on the words.
//
// Keying: a pixel is background by how far green exceeds max(red, blue), so
// the red fox, blue cat and yellow cat (green below red) all stay opaque.
// Green spill on soft edges is pulled down to max(red, blue), then premultiplied.
//
//   swiftc -O karate-trainer/tools/make-cheer.swift -o /tmp/make-cheer
//   /tmp/make-cheer input.mp4 public/characters/cheer/en/alan 0.10-1.80 2.10-3.62 … [--preview sheet.png]
import AVFoundation
import CoreImage
import AppKit

let side = 256
let LO = 20, HI = 60          // green excess: <= LO opaque, >= HI transparent
let PRE = 0.08, POST = 0.15   // padding around each spoken range, seconds

var args = Array(CommandLine.arguments.dropFirst())
var previewPath: String?
if let i = args.firstIndex(of: "--preview"), i + 1 < args.count { previewPath = args[i + 1]; args.removeSubrange(i...i + 1) }
guard args.count >= 3 else { print("usage: make-cheer input.mp4 outPrefix start-end … [--preview sheet.png]"); exit(2) }
let src = URL(fileURLWithPath: args[0])
let prefix = args[1]
let ranges: [(Double, Double)] = args.dropFirst(2).map {
  let p = $0.split(separator: "-").map { Double($0)! }
  return (p[0], p[1])
}

func makeBuffer() -> CVPixelBuffer {
  var pb: CVPixelBuffer?
  CVPixelBufferCreate(nil, side, side, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
  return pb!
}

func keyOut(_ pb: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(pb, [])
  defer { CVPixelBufferUnlockBaseAddress(pb, []) }
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
  let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  for y in 0..<h {
    for x in 0..<w {
      let o = y * row + x * 4
      let b = Int(p[o]), r = Int(p[o + 2])
      var g = Int(p[o + 1])
      let other = max(r, b)
      let excess = g - other
      let a = excess <= LO ? 255 : excess >= HI ? 0 : 255 * (HI - excess) / (HI - LO)
      if g > other { g = other }   // despill
      p[o] = UInt8(b * a / 255); p[o + 1] = UInt8(g * a / 255); p[o + 2] = UInt8(r * a / 255); p[o + 3] = UInt8(a)
    }
  }
}

func writeVideo(_ asset: AVURLAsset, _ range: CMTimeRange, to out: URL) async throws -> Int {
  let track = try await asset.loadTracks(withMediaType: .video).first!
  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = range
  let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  reader.add(ro)
  try? FileManager.default.removeItem(at: out)
  let writer = try AVAssetWriter(outputURL: out, fileType: .mov)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha, AVVideoWidthKey: side, AVVideoHeightKey: side,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 600_000],
  ])
  input.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
  writer.add(input)
  reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)
  let ctx = CIContext(options: [.workingColorSpace: NSNull()])
  var n = 0
  while let sb = ro.copyNextSampleBuffer() {
    guard let ib = CMSampleBufferGetImageBuffer(sb) else { continue }
    let t = CMTimeSubtract(CMSampleBufferGetPresentationTimeStamp(sb), range.start)
    let img = CIImage(cvPixelBuffer: ib)
    let scaled = img.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: CGFloat(side) / img.extent.width, kCIInputAspectRatioKey: 1.0])
    let pb = makeBuffer()
    ctx.render(scaled, to: pb, bounds: CGRect(x: 0, y: 0, width: side, height: side), colorSpace: nil)
    keyOut(pb)
    CVBufferSetAttachment(pb, kCVImageBufferAlphaChannelModeKey, kCVImageBufferAlphaChannelMode_PremultipliedAlpha, .shouldPropagate)
    while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
    adaptor.append(pb, withPresentationTime: t)
    n += 1
  }
  input.markAsFinished()
  await writer.finishWriting()
  if let e = writer.error { throw e }
  return n
}

func writeAudio(_ asset: AVURLAsset, _ range: CMTimeRange, to out: URL) async throws {
  let track = try await asset.loadTracks(withMediaType: .audio).first!
  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = range
  let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false,
  ])
  reader.add(ro)
  try? FileManager.default.removeItem(at: out)
  let writer = try AVAssetWriter(outputURL: out, fileType: .m4a)
  let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96_000,
  ])
  input.expectsMediaDataInRealTime = false
  writer.add(input)
  reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: range.start)
  while let sb = ro.copyNextSampleBuffer() {
    while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
    input.append(sb)
  }
  input.markAsFinished()
  writer.endSession(atSourceTime: CMTimeRangeGetEnd(range))
  await writer.finishWriting()
  if let e = writer.error { throw e }
}

let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let asset = AVURLAsset(url: src)
    let total = try await asset.load(.duration).seconds
    var mids: [(URL, Double)] = []
    try FileManager.default.createDirectory(at: URL(fileURLWithPath: prefix).deletingLastPathComponent(), withIntermediateDirectories: true)
    for (k, (s, e)) in ranges.enumerated() {
      // Padding never reaches into a neighbouring phrase (some are 0.1 s apart).
      let prevEnd = k > 0 ? ranges[k - 1].1 + 0.02 : 0
      let nextStart = k + 1 < ranges.count ? ranges[k + 1].0 - 0.02 : total
      let a = max(prevEnd, s - PRE), b = min(nextStart, e + POST)
      let range = CMTimeRange(start: CMTime(seconds: a, preferredTimescale: 600), end: CMTime(seconds: b, preferredTimescale: 600))
      let mov = URL(fileURLWithPath: "\(prefix)-\(k + 1).mov"), m4a = URL(fileURLWithPath: "\(prefix)-\(k + 1).m4a")
      let frames = try await writeVideo(asset, range, to: mov)
      try await writeAudio(asset, range, to: m4a)
      let bytes = (try FileManager.default.attributesOfItem(atPath: mov.path)[.size] as? Int) ?? 0
      print(String(format: "%@-%d  %.2f–%.2f  (%.2fs, %d frames, %d KB)", (prefix as NSString).lastPathComponent, k + 1, a, b, b - a, frames, bytes / 1024))
      mids.append((mov, (e - s) / 2 + (s - a)))
    }

    // Optional preview: each clip's middle frame over a checkerboard, so any
    // green fringe or holes in the character show up.
    guard let previewPath else { sem.signal(); return }
    let cols = min(4, mids.count), rows = (mids.count + cols - 1) / cols
    let sheet = CGContext(data: nil, width: side * cols, height: side * rows, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    for yy in stride(from: 0, to: side * rows, by: 16) { for xx in stride(from: 0, to: side * cols, by: 16) {
      let dark = ((xx + yy) / 16) % 2 == 0
      sheet.setFillColor(dark ? CGColor(red: 0.16, green: 0.14, blue: 0.24, alpha: 1) : CGColor(red: 0.85, green: 0.85, blue: 0.85, alpha: 1))
      sheet.fill(CGRect(x: xx, y: yy, width: 16, height: 16))
    } }
    for (k, (mov, t)) in mids.enumerated() {
      let gen = AVAssetImageGenerator(asset: AVURLAsset(url: mov))
      gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
      let (cg, _) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 600))
      sheet.draw(cg, in: CGRect(x: (k % cols) * side, y: (rows - 1 - k / cols) * side, width: side, height: side))
    }
    let rep = NSBitmapImageRep(cgImage: sheet.makeImage()!)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: previewPath))
    print("preview", previewPath)
  } catch { print("error", error); exit(1) }
  sem.signal()
}
sem.wait()
