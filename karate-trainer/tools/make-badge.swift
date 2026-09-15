// Makes the corner badge burned into saved videos (alan-badge.mov) from a
// square clip on a white background. The background is near-white pixels
// flood-filled from the frame edges only, so white enclosed by outlines
// (Alan's gi, text fills) stays opaque; edges are softened and de-whitened.
// Output: 360x360 HEVC with alpha, no sound.
//
//   swiftc -O karate-trainer/tools/make-badge.swift -o /tmp/make-badge
//   /tmp/make-badge input.mp4 karate-trainer/public/characters/alan-badge.mov [preview.png]
import AVFoundation
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: make-badge input.mp4 output.mov [preview.png]"); exit(2) }
let src = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let previewPath: String? = args.count > 3 ? args[3] : nil
let side = 360
let MINV = 222, CHROMA = 30

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
  var bg = [UInt8](repeating: 0, count: w * h)
  var stack: [Int] = []
  stack.reserveCapacity(w * h)
  @inline(__always) func isWhite(_ x: Int, _ y: Int) -> Bool {
    let o = y * row + x * 4
    let b = Int(p[o]), g = Int(p[o + 1]), r = Int(p[o + 2])
    let mn = min(r, min(g, b)), mx = max(r, max(g, b))
    return mn >= MINV && mx - mn <= CHROMA
  }
  func seed(_ x: Int, _ y: Int) { let i = y * w + x; if bg[i] == 0 && isWhite(x, y) { bg[i] = 1; stack.append(i) } }
  for x in 0..<w { seed(x, 0); seed(x, h - 1) }
  for y in 0..<h { seed(0, y); seed(w - 1, y) }
  while let i = stack.popLast() {
    let x = i % w, y = i / w
    if x > 0 { seed(x - 1, y) }
    if x < w - 1 { seed(x + 1, y) }
    if y > 0 { seed(x, y - 1) }
    if y < h - 1 { seed(x, y + 1) }
  }
  for y in 0..<h {
    for x in 0..<w {
      let o = y * row + x * 4
      var a = 0
      if bg[y * w + x] == 0 {
        var sum = 0, n = 0
        for dy in -1...1 { for dx in -1...1 {
          let xx = x + dx, yy = y + dy
          if xx >= 0 && yy >= 0 && xx < w && yy < h { sum += bg[yy * w + xx] == 1 ? 0 : 255; n += 1 }
        } }
        a = sum / n
      }
      // Premultiply and take the white back out of soft edge pixels (no halo).
      for c in 0..<3 { p[o + c] = UInt8(max(0, min(a, Int(p[o + c]) - (255 - a)))) }
      p[o + 3] = UInt8(a)
    }
  }
}

let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let asset = AVURLAsset(url: src)
    let track = try await asset.loadTracks(withMediaType: .video).first!
    let reader = try AVAssetReader(asset: asset)
    let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    reader.add(ro)
    try? FileManager.default.removeItem(at: out)
    let writer = try AVAssetWriter(outputURL: out, fileType: .mov)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha, AVVideoWidthKey: side, AVVideoHeightKey: side,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_200_000],
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
    writer.add(input)
    reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)
    let ctx = CIContext(options: [.workingColorSpace: NSNull()])
    var n = 0
    while let sb = ro.copyNextSampleBuffer() {
      guard let ib = CMSampleBufferGetImageBuffer(sb) else { continue }
      let t = CMSampleBufferGetPresentationTimeStamp(sb)
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
    print("frames", n, "writer status", writer.status.rawValue, writer.error.map { "\($0)" } ?? "ok")

    // Optional preview sheet: 6 frames over a checkerboard (like the camera behind it).
    let outAsset = AVURLAsset(url: out)
    let f = try await outAsset.loadTracks(withMediaType: .video).first!.load(.formatDescriptions).first!
    print("output alpha:", (CMFormatDescriptionGetExtensions(f) as? [String: Any])?["ContainsAlphaChannel"] ?? "no",
          "size bytes:", (try FileManager.default.attributesOfItem(atPath: out.path)[.size] as? Int) ?? 0)
    guard let previewPath else { sem.signal(); return }
    let gen = AVAssetImageGenerator(asset: outAsset)
    gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
    let times = [0.3, 1.2, 2.5, 5.0, 7.5, 9.7]
    let sheet = CGContext(data: nil, width: side * 3, height: side * 2, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    for yy in stride(from: 0, to: side * 2, by: 24) { for xx in stride(from: 0, to: side * 3, by: 24) {
      let dark = ((xx + yy) / 24) % 2 == 0
      sheet.setFillColor(dark ? CGColor(red: 0.16, green: 0.14, blue: 0.24, alpha: 1) : CGColor(red: 0.30, green: 0.45, blue: 0.35, alpha: 1))
      sheet.fill(CGRect(x: xx, y: yy, width: 24, height: 24))
    } }
    for (k, t) in times.enumerated() {
      let (cg, _) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 600))
      sheet.draw(cg, in: CGRect(x: (k % 3) * side, y: (1 - k / 3) * side, width: side, height: side))
    }
    let rep = NSBitmapImageRep(cgImage: sheet.makeImage()!)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: previewPath))
    print("preview written")
  } catch { print("error", error) }
  sem.signal()
}
sem.wait()
