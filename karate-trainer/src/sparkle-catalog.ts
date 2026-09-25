// ✨キラキラ の一覧 — 名前・色・描きかた・どうやったら手に入るか。
//
// **手で書き換えないこと。** 元は tools/kirakira-glyphs/gen.py の表で、
//   python3 tools/kirakira-glyphs/gen.py
// を走らせると、このファイルと ios/.../Effects.json の両方が書き直される。
// ネイティブ（描くほう）と画面（集めるほう）で名前や色がずれないように。

export type SparkleTier = "start" | "short" | "long";

/// どう描くか。どれも **腕（肩→肘→手首）に沿って** 描く。
///   lightning … 腕にまとわりつく稲妻。枝分かれし、パチパチ引き直す
///   spiral    … 腕をぐるぐる回る帯。時間で回る
///   aura      … 腕ぜんたいが太く光って ゆっくり脈打つ
export type SparkleStyle = "lightning" | "spiral" | "aura";

export interface SparkleDef {
  id: string;
  name: string;
  mode: "karate" | "piano";
  style: SparkleStyle;
  tier: SparkleTier;
  color: string;
}

export const SPARKLES: SparkleDef[] = [
  { id: "kiBlue", name: "🔵 あおい オーラ", mode: "karate", style: "aura", tier: "start", color: "#338cff" },
  { id: "boltGold", name: "⚡️ いなずま", mode: "karate", style: "lightning", tier: "start", color: "#ffd61a" },
  { id: "flame", name: "🔥 ほのお", mode: "karate", style: "spiral", tier: "short", color: "#ff7314" },
  { id: "wind", name: "🌀 かぜ", mode: "karate", style: "spiral", tier: "short", color: "#4cf2eb" },
  { id: "ice", name: "❄️ こおり", mode: "karate", style: "lightning", tier: "short", color: "#9ee6ff" },
  { id: "heart", name: "💗 ハート", mode: "karate", style: "spiral", tier: "short", color: "#ff5c8f" },
  { id: "kiRed", name: "🔴 あかい オーラ", mode: "karate", style: "aura", tier: "long", color: "#ff3824" },
  { id: "boltViolet", name: "💜 むらさきの雷", mode: "karate", style: "lightning", tier: "long", color: "#b266ff" },
  { id: "dragon", name: "🐉 ドラゴン", mode: "karate", style: "spiral", tier: "long", color: "#52eb99" },
  { id: "starGold", name: "⭐️ きらめき", mode: "karate", style: "lightning", tier: "long", color: "#fff059" },
  { id: "kiGold", name: "🟡 きんの オーラ", mode: "karate", style: "aura", tier: "long", color: "#ffd61a" },
  { id: "pnSpark", name: "✨ きらり", mode: "piano", style: "aura", tier: "start", color: "#fff2a8" },
  { id: "pnNote", name: "🎵 おんぷ", mode: "piano", style: "spiral", tier: "start", color: "#59d1ff" },
  { id: "pnHeart", name: "💗 ハート", mode: "piano", style: "spiral", tier: "short", color: "#ff5c8f" },
  { id: "pnMoon", name: "🌙 つき", mode: "piano", style: "spiral", tier: "short", color: "#ffe08a" },
  { id: "pnSnow", name: "❄️ ゆき", mode: "piano", style: "lightning", tier: "short", color: "#9ee6ff" },
  { id: "pnFlower", name: "🌸 おはな", mode: "piano", style: "spiral", tier: "short", color: "#ff8fc7" },
  { id: "pnStar", name: "⭐️ ほし", mode: "piano", style: "lightning", tier: "long", color: "#ffd61a" },
  { id: "pnKiBlue", name: "🔵 あおい オーラ", mode: "piano", style: "aura", tier: "long", color: "#338cff" },
  { id: "pnGem", name: "💎 ダイヤ", mode: "piano", style: "spiral", tier: "long", color: "#4cf2eb" },
];
