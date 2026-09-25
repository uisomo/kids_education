// ✨キラキラ の一覧 — 名前・色・描きかた・どうやったら手に入るか。
//
// **手で書き換えないこと。** 元は tools/kirakira-glyphs/gen.py の表で、
//   python3 tools/kirakira-glyphs/gen.py
// を走らせると、このファイルと ios/.../Effects.json の両方が書き直される。
// ネイティブ（描くほう）と画面（集めるほう）で名前や色がずれないように。

export type SparkleTier = "start" | "short" | "long";

/// どう **動く** か。どれも腕（肩→肘→手首）に沿って描く。色を変えただけの
/// 同じ線は、ぜんぶ同じものに見えてしまうので、動きそのものを変えてある。
/// 中身は ios/.../Scene.swift の `switch style`。
export type SparkleStyle =
  | "lightning"   // ギザギザがまとわりつき、枝分かれし、パチパチ引き直す
  | "flame"       // 炎の舌が画面の上へ立ちのぼる＋火の粉
  | "ice"         // 角ばった結晶がまっすぐ生える。揺れない
  | "blizzard"    // 粒とすじが流れて通り過ぎる
  | "water"       // 太くやわらかい帯がうねる＋しずく
  | "wind"        // 三日月が腕に沿って通り過ぎる
  | "sparkle"     // 星の粒がまたたく
  | "petal"       // 花びらが舞う
  | "shadow"      // 太くてふちのぎざぎざした影がうねる
  | "dragon"      // 長い胴が巻きついて、手首の先へ抜けて尾になる
  | "rainbow"     // 3色の帯
  | "aura"        // 腕ぜんたいが太く光って脈打つ
  | "ribbon";     // なめらかな帯がぐるぐる回る

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
  { id: "flame", name: "🔥 ほのお", mode: "karate", style: "flame", tier: "short", color: "#ff7314" },
  { id: "ice", name: "❄️ こおり", mode: "karate", style: "ice", tier: "short", color: "#9eebff" },
  { id: "wind", name: "🌪 かぜ", mode: "karate", style: "wind", tier: "short", color: "#4cf299" },
  { id: "water", name: "💧 みず", mode: "karate", style: "water", tier: "short", color: "#59d1ff" },
  { id: "sparkle", name: "✨ きらめき", mode: "karate", style: "sparkle", tier: "short", color: "#fff059" },
  { id: "petal", name: "🌸 はなびら", mode: "karate", style: "petal", tier: "short", color: "#ff9ecc" },
  { id: "ribbonPink", name: "🎀 リボン", mode: "karate", style: "ribbon", tier: "short", color: "#ff5c8f" },
  { id: "auraGreen", name: "🟢 みどりの オーラ", mode: "karate", style: "aura", tier: "short", color: "#a8ff40" },
  { id: "blizzard", name: "🌨 ふぶき", mode: "karate", style: "blizzard", tier: "long", color: "#ebf7ff" },
  { id: "dragon", name: "🐉 ドラゴン", mode: "karate", style: "dragon", tier: "long", color: "#4cf299" },
  { id: "shadow", name: "🌑 かげ", mode: "karate", style: "shadow", tier: "long", color: "#b266ff" },
  { id: "rainbow", name: "🌈 にじ", mode: "karate", style: "rainbow", tier: "long", color: "#ebf7ff" },
  { id: "boltViolet", name: "💜 むらさきの雷", mode: "karate", style: "lightning", tier: "long", color: "#b266ff" },
  { id: "flameBlue", name: "💙 あおい ほのお", mode: "karate", style: "flame", tier: "long", color: "#59d1ff" },
  { id: "flameEmber", name: "🌋 まぐま", mode: "karate", style: "flame", tier: "long", color: "#ff4c0d" },
  { id: "iceWhite", name: "🧊 ダイヤの こおり", mode: "karate", style: "ice", tier: "long", color: "#ccdbf2" },
  { id: "kiRed", name: "🔴 あかい オーラ", mode: "karate", style: "aura", tier: "long", color: "#ff3824" },
  { id: "kiGold", name: "🟡 きんの オーラ", mode: "karate", style: "aura", tier: "long", color: "#ffd61a" },
  { id: "dragonRed", name: "🔥 ひの ドラゴン", mode: "karate", style: "dragon", tier: "long", color: "#ff3824" },
  { id: "sparkleGold", name: "🌟 きんの きらめき", mode: "karate", style: "sparkle", tier: "long", color: "#ffd61a" },
  { id: "waterTeal", name: "🌊 おおなみ", mode: "karate", style: "water", tier: "long", color: "#1ad9bf" },
  { id: "windGold", name: "💨 かみかぜ", mode: "karate", style: "wind", tier: "long", color: "#ffd61a" },
  { id: "shadowMag", name: "🟣 やみ", mode: "karate", style: "shadow", tier: "long", color: "#ff40d9" },
  { id: "boltIndigo", name: "🌩 かみなりの王", mode: "karate", style: "lightning", tier: "long", color: "#6b61ff" },
  { id: "pnSpark", name: "✨ きらり", mode: "piano", style: "sparkle", tier: "start", color: "#fff2b2" },
  { id: "pnAura", name: "🤍 やさしい ひかり", mode: "piano", style: "aura", tier: "start", color: "#ebf7ff" },
  { id: "pnPetal", name: "🌸 はなびら", mode: "piano", style: "petal", tier: "short", color: "#ff9ecc" },
  { id: "pnWater", name: "💧 しずく", mode: "piano", style: "water", tier: "short", color: "#59d1ff" },
  { id: "pnRibbon", name: "🎀 リボン", mode: "piano", style: "ribbon", tier: "short", color: "#ff5c8f" },
  { id: "pnSnow", name: "❄️ ゆき", mode: "piano", style: "ice", tier: "short", color: "#9eebff" },
  { id: "pnWind", name: "🌪 そよかぜ", mode: "piano", style: "wind", tier: "short", color: "#4cf299" },
  { id: "pnRainbow", name: "🌈 にじ", mode: "piano", style: "rainbow", tier: "long", color: "#ebf7ff" },
  { id: "pnBlizzard", name: "🌨 ふぶき", mode: "piano", style: "blizzard", tier: "long", color: "#ebf7ff" },
  { id: "pnSparkGold", name: "🌟 きんの きらめき", mode: "piano", style: "sparkle", tier: "long", color: "#ffd61a" },
  { id: "pnBolt", name: "⚡️ いなずま", mode: "piano", style: "lightning", tier: "long", color: "#ffd61a" },
  { id: "pnDragon", name: "🐉 ドラゴン", mode: "piano", style: "dragon", tier: "long", color: "#b266ff" },
  { id: "pnFlame", name: "🔥 ほのお", mode: "piano", style: "flame", tier: "long", color: "#ff7314" },
  { id: "pnAuraGold", name: "🟡 きんの ひかり", mode: "piano", style: "aura", tier: "long", color: "#ffd61a" },
];
