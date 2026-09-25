import Foundation

public struct FXPoint: Codable, Sendable, Equatable {
    public var x: Double
    public var y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
    public var isFinite: Bool { x.isFinite && y.isFinite }
    public var inUnitSquare: Bool { isFinite && (0...1).contains(x) && (0...1).contains(y) }
    public static let zero = FXPoint(0, 0)
    public static func + (a: Self, b: Self) -> Self { .init(a.x + b.x, a.y + b.y) }
    public static func - (a: Self, b: Self) -> Self { .init(a.x - b.x, a.y - b.y) }
    public static func * (a: Self, b: Double) -> Self { .init(a.x * b, a.y * b) }
    public func length(aspect: Double = 1) -> Double { hypot(x * aspect, y) }
    public func distance(to other: Self, aspect: Double = 1) -> Double { (self - other).length(aspect: aspect) }
    public func mixed(with other: Self, amount: Double) -> Self { self + (other - self) * fxClamp(amount) }
}
public func fxClamp(_ x: Double, _ low: Double = 0, _ high: Double = 1) -> Double {
    x.isFinite ? min(high, max(low, x)) : low
}
public struct FXSize: Codable, Sendable, Equatable {
    public var width: Double
    public var height: Double
    public init(_ width: Double, _ height: Double) { self.width = width; self.height = height }
    public var isValid: Bool { width.isFinite && height.isFinite && width > 0 && height > 0 }
    public var aspect: Double { isValid ? width / height : 1 }
}
public struct FXRect: Codable, Sendable, Equatable {
    public var x: Double; public var y: Double; public var width: Double; public var height: Double
    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x; self.y = y; self.width = width; self.height = height
    }
    public func contains(_ point: FXPoint, padding: Double = 0) -> Bool {
        point.x >= x - padding && point.x <= x + width + padding &&
        point.y >= y - padding && point.y <= y + height + padding
    }
}
public enum FXContentMode: String, Codable, Sendable { case fit, fill }
/// All input points: upright image, top-left origin, normalized 0...1. Mirror ONLY here.
public struct VideoCoordinateMapper: Sendable {
    public let source: FXSize; public let viewport: FXSize
    public let mode: FXContentMode; public let mirrored: Bool
    public init(source: FXSize, viewport: FXSize, mode: FXContentMode = .fit, mirrored: Bool = false) {
        self.source = source; self.viewport = viewport; self.mode = mode; self.mirrored = mirrored
    }
    public var videoRect: FXRect {
        guard source.isValid, viewport.isValid else { return .init(x: 0, y: 0, width: 0, height: 0) }
        let ratios = (viewport.width / source.width, viewport.height / source.height)
        let s = mode == .fit ? min(ratios.0, ratios.1) : max(ratios.0, ratios.1)
        let w = source.width * s, h = source.height * s
        return .init(x: (viewport.width-w)/2, y: (viewport.height-h)/2, width: w, height: h)
    }
    public func map(_ p: FXPoint) -> FXPoint {
        let r = videoRect
        return .init(r.x + (mirrored ? 1-p.x : p.x)*r.width, r.y + p.y*r.height)
    }
    public func unmap(_ p: FXPoint) -> FXPoint? {
        let r = videoRect
        guard r.width > 0, r.height > 0 else { return nil }
        let x = (p.x-r.x)/r.width
        let result = FXPoint(mirrored ? 1-x : x, (p.y-r.y)/r.height)
        return result.inUnitSquare ? result : nil
    }
}
