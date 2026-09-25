#if os(iOS)
import Foundation
import CoreImage
import CoreVideo
import ImageIO

/// A single reusable small BGRA analysis buffer. Serial use only.
final class FramePreprocessor {
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private var buffer: CVPixelBuffer?
    private var bufferWidth = 0, bufferHeight = 0
    func prepare(_ input: CVPixelBuffer, orientation: CGImagePropertyOrientation,
                 longestEdge: Int) throws -> (CVPixelBuffer, FXSize) {
        let oriented = CIImage(cvPixelBuffer: input).oriented(orientation)
        let rect = oriented.extent
        guard rect.width > 0, rect.height > 0 else { throw FXError.invalidData("Empty video frame.") }
        let scale = min(1, CGFloat(longestEdge)/max(rect.width,rect.height))
        let w = max(2,Int((rect.width*scale/2).rounded())*2)
        let h = max(2,Int((rect.height*scale/2).rounded())*2)
        if buffer == nil || w != bufferWidth || h != bufferHeight {
            var created: CVPixelBuffer?
            let attrs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [:], kCVPixelBufferMetalCompatibilityKey: true]
            let status = CVPixelBufferCreate(kCFAllocatorDefault,w,h,kCVPixelFormatType_32BGRA,attrs as CFDictionary,&created)
            guard status == kCVReturnSuccess, let created else { throw FXError.invalidData("Unable to allocate analysis buffer: \(status)") }
            buffer = created; bufferWidth = w; bufferHeight = h
        }
        let image = oriented.transformed(by: .init(translationX: -rect.minX, y: -rect.minY))
            .transformed(by: .init(scaleX: CGFloat(w)/rect.width, y: CGFloat(h)/rect.height))
        guard let buffer else { throw FXError.invalidData("Analysis buffer is unavailable.") }
        context.render(image, to: buffer, bounds: CGRect(x: 0,y: 0,width: w,height: h), colorSpace: colorSpace)
        // A normalized point is unchanged by the tiny even-pixel resize stretch.
        return (buffer,FXSize(Double(rect.width),Double(rect.height)))
    }
}
#endif
