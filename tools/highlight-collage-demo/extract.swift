import Foundation
import Vision
import AppKit
import CoreImage
let root = URL(fileURLWithPath:CommandLine.arguments[1])
let ctx = CIContext()
for i in 0..<8 {
 let url=root.appendingPathComponent("frame-\(i).jpg")
 guard let im=CIImage(contentsOf:url) else {continue}
 let e=im.extent
 let crop=im.cropped(to:CGRect(x:0,y:e.height*0.44,width:e.width,height:e.height*0.44)).transformed(by:CGAffineTransform(translationX:0,y: -e.height*0.44))
 guard let cg=ctx.createCGImage(crop,from:crop.extent) else {continue}
 let photo=NSBitmapImageRep(cgImage:cg)
 try photo.representation(using:.png,properties:[:])!.write(to:root.appendingPathComponent("photo-\(i).png"))
 let req=VNGeneratePersonSegmentationRequest(); req.qualityLevel = .accurate;req.outputPixelFormat=kCVPixelFormatType_OneComponent8
 try VNImageRequestHandler(cgImage:cg).perform([req])
 if let pb=req.results?.first?.pixelBuffer {
   let m=CIImage(cvPixelBuffer:pb)
   let scaled=m.transformed(by:CGAffineTransform(scaleX:crop.extent.width/m.extent.width,y:crop.extent.height/m.extent.height))
   let masked=crop.applyingFilter("CIBlendWithMask",parameters:[kCIInputBackgroundImageKey:CIImage(color:.clear).cropped(to:crop.extent),kCIInputMaskImageKey:scaled])
   let output=NSBitmapImageRep(cgImage:ctx.createCGImage(masked,from:crop.extent)!)
   try output.representation(using:.png,properties:[:])!.write(to:root.appendingPathComponent("person-\(i).png"))
 }
 print("frame \(i) extracted")
}
print("complete")
