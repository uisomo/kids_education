import Foundation
import Vision
import AppKit
import ImageIO
let root=URL(fileURLWithPath:CommandLine.arguments[1])
func box(_ r:CGRect,_ w:CGFloat,_ h:CGFloat)->[Double]{[Double(r.minX*w),Double((1-r.maxY)*h),Double(r.width*w),Double(r.height*h)]}
var records:[[String:Any]]=[]
for i in 0..<53 {
 let url=root.appendingPathComponent(String(format:"frame-%02d.jpg",i))
 guard let src=CGImageSourceCreateWithURL(url as CFURL,nil),let cg=CGImageSourceCreateImageAtIndex(src,0,nil) else {continue}
 let face=VNDetectFaceLandmarksRequest();face.usesCPUOnly=true
 let body=VNDetectHumanBodyPoseRequest();body.usesCPUOnly=true
 try VNImageRequestHandler(cgImage:cg).perform([face,body])
 let w=CGFloat(cg.width),h=CGFloat(cg.height)
 var faces:[[String:Any]]=[]
 for f in face.results ?? [] {
  var points:[String:[[Double]]]=[:]
  for (name,part) in [("leftEye",f.landmarks?.leftEye),("rightEye",f.landmarks?.rightEye),("nose",f.landmarks?.nose),("lips",f.landmarks?.outerLips),("contour",f.landmarks?.faceContour)] {
   if let part { points[name]=part.normalizedPoints.map{p in [Double((f.boundingBox.minX+CGFloat(p.x)*f.boundingBox.width)*w),Double((1-f.boundingBox.minY-CGFloat(p.y)*f.boundingBox.height)*h)]} }
  }
  faces.append(["bounds":box(f.boundingBox,w,h),"confidence":f.confidence,"landmarks":points])
 }
 var bodies:[[String:Any]]=[]
 for b in body.results ?? [] {
  let p=try b.recognizedPoints(.all);var joints:[String:[Double]]=[:]
  for (name,j) in p where j.confidence>0.25 {joints[name.rawValue.rawValue]=[Double(j.location.x*w),Double((1-j.location.y)*h),Double(j.confidence)]}
  bodies.append(joints)
 }
 records.append(["frame":i,"size":[cg.width,cg.height],"faces":faces,"bodies":bodies])
}
try JSONSerialization.data(withJSONObject:["coordinateSpace":"upright source pixels, top-left origin","frames":records],options:[.prettyPrinted,.sortedKeys]).write(to:root.appendingPathComponent("parts.json"))
print("Source part analysis complete")
