import Foundation

public struct FXColor: Codable, Sendable, Equatable {
    public var red: Double; public var green: Double; public var blue: Double; public var alpha: Double
    public init(_ red: Double, _ green: Double, _ blue: Double, _ alpha: Double = 1) {
        self.red = red; self.green = green; self.blue = blue; self.alpha = alpha
    }
    public func opacity(_ multiplier: Double) -> Self {
        .init(red, green, blue, fxClamp(alpha*multiplier))
    }
}
public struct EffectPreset: Codable, Sendable, Identifiable {
    public let id: String; public let name: String; public let mode: PracticeMode
    public let style: String; public let color: FXColor
    public let opacity: Double; public let radius: Double
    public let trailSeconds: Double; public let burstSeconds: Double; public let maxAnchors: Int
    /// 使っていない（かざりは形を貼るのをやめて、骨に沿って描くようにした）。
    /// 古い Effects.json を読んでも落ちないように残してある。
    public let glyph: String?
}
public struct VectorGlyph: Codable, Sendable {
    public var id: String
    /// Each subpath uses centered coordinates (-0.5...0.5), with positive Y pointing down.
    public var paths: [[FXPoint]]
    public var closed: Bool
    /// 塗りつぶすか、線だけか。細い線だけだと、子どもには何の形か分からない
    /// （⚡️ が「ただの落書き」に見えていた）。省いたら線だけ。
    public var fill: Bool?
    public var isFilled: Bool { fill ?? false }
}
public struct EffectCatalog: Codable, Sendable {
    public let schemaVersion: Int
    public let presets: [EffectPreset]
    public let glyphs: [VectorGlyph]
    public static func bundled() throws -> EffectCatalog {
        guard let url = Bundle.main.url(forResource: "Effects", withExtension: "json") else { throw FXError.assetMissing }
        let catalog = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
        try catalog.validate()
        return catalog
    }
    public func preset(_ id: String) -> EffectPreset? { presets.first { $0.id == id } }
    public func glyph(_ id: String) -> VectorGlyph? { glyphs.first { $0.id == id } }
    public func validate() throws {
        guard schemaVersion == 2, Set(presets.map(\.id)).count == presets.count,
              Set(glyphs.map(\.id)).count == glyphs.count else { throw FXError.invalidData("Invalid or duplicate catalog IDs.") }
        for p in presets {
            guard (0...1).contains(p.opacity), (0.005...0.045).contains(p.radius),
                  (0...0.20).contains(p.trailSeconds), (0.08...0.40).contains(p.burstSeconds),
                  (1...2).contains(p.maxAnchors), [p.color.red,p.color.green,p.color.blue,p.color.alpha].allSatisfy({ (0...1).contains($0) }),
                  ["lightning","spiral","aura"].contains(p.style) else {
                throw FXError.invalidData("Unsafe effect size, opacity, color, style or particle budget: \(p.id)")
            }
        }
        for g in glyphs {
            guard !g.paths.isEmpty, g.paths.allSatisfy({ !$0.isEmpty && $0.allSatisfy { $0.isFinite && abs($0.x)<=0.5 && abs($0.y)<=0.5 } }) else {
                throw FXError.invalidData("Invalid vector glyph: \(g.id)")
            }
        }
        guard !presets.isEmpty else { throw FXError.assetMissing }
    }
}
