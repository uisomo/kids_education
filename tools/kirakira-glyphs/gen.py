#!/usr/bin/env python3
# ✨キラキラ の元になる表。ここを直して `python3 tools/kirakira-glyphs/gen.py` を
# 走らせると、2つのファイルが書き直される:
#
#   ios/App/App/PracticeMotionFX/Effects.json   ネイティブが描くときの色と style
#   karate-trainer/src/sparkle-catalog.ts       画面（キラキラのタブ）に出す名前と色
#
# 同じものを2か所で手書きすると、必ず片方がずれる。名前・色・アンロックの
# 決まりは **この表だけ** が持つ。
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# tier — どうやったら手に入るか。決まりの本体は sparkle-store.ts。
#   start … はじめから使える
#   short … 3分以上のメニューを、休まず最後までやりきったら1つ
#   long  … 休憩なしの5分以上を、最後までやりきったら1つ
#
# style — ネイティブの **動きかた**。色を変えただけの同じ線は、ぜんぶ同じものに
#   見える（実際そう言われた）。だから style ごとに動きそのものを変えてある。
#   どれも腕（肩→肘→手首）に沿って描く。
#
#   lightning … ギザギザが腕にまとわりつき、枝分かれし、1秒に14回引き直す
#   flame     … 炎の舌が **画面の上へ** 立ちのぼる（腕の向きに従わない）＋火の粉
#   ice       … 角ばった結晶が左右交互に **まっすぐ生える**。揺れない
#   blizzard  … 粒と すじが腕のまわりを **流れて通り過ぎる**
#   water     … 太くやわらかい帯が うねる＋しずく
#   wind      … 三日月が腕に沿って **通り過ぎていく**
#   sparkle   … 星の粒が またたく
#   petal     … 花びらが 舞う
#   shadow    … 太くて ふちのぎざぎざした影が ゆっくり うねる
#   dragon    … 長い胴が腕に巻きついて、**手首の先へ抜けて尾になる**
#   rainbow   … 3色の帯（preset の色は使わない）
#   aura      … 腕ぜんたいが太く光って ゆっくり脈打つ
#   ribbon    … なめらかな帯が ぐるぐる回る
C = {
    "gold":   (1.00, 0.84, 0.10), "pink":   (1.00, 0.36, 0.56), "orange": (1.00, 0.45, 0.08),
    "petal":  (1.00, 0.62, 0.80), "lemon":  (1.00, 0.94, 0.35), "sky":    (0.35, 0.82, 1.00),
    "ice":    (0.62, 0.92, 1.00), "cream":  (1.00, 0.95, 0.70), "cyan":   (0.30, 0.95, 0.92),
    "moon":   (1.00, 0.88, 0.54), "mint":   (0.30, 0.95, 0.60), "white":  (0.92, 0.97, 1.00),
    "red":    (1.00, 0.22, 0.14), "blue":   (0.20, 0.55, 1.00), "violet": (0.70, 0.40, 1.00),
    "indigo": (0.42, 0.38, 1.00), "lime":   (0.66, 1.00, 0.25), "magenta":(1.00, 0.25, 0.85),
    "ember":  (1.00, 0.30, 0.05), "teal":   (0.10, 0.85, 0.75), "silver": (0.80, 0.86, 0.95),
}

# id, 画面の名前, mode, style, 色, tier
CATALOG = [
    # ── 空手 ───────────────────────────────────────────────────────────
    ("kiBlue",     "🔵 あおい オーラ",   "karate", "aura",      "blue",    "start"),
    ("boltGold",   "⚡️ いなずま",        "karate", "lightning", "gold",    "start"),
    ("flame",      "🔥 ほのお",          "karate", "flame",     "orange",  "short"),
    ("ice",        "❄️ こおり",          "karate", "ice",       "ice",     "short"),
    ("wind",       "🌪 かぜ",            "karate", "wind",      "mint",    "short"),
    ("water",      "💧 みず",            "karate", "water",     "sky",     "short"),
    ("sparkle",    "✨ きらめき",        "karate", "sparkle",   "lemon",   "short"),
    ("petal",      "🌸 はなびら",        "karate", "petal",     "petal",   "short"),
    ("ribbonPink", "🎀 リボン",          "karate", "ribbon",    "pink",    "short"),
    ("auraGreen",  "🟢 みどりの オーラ", "karate", "aura",      "lime",    "short"),
    ("blizzard",   "🌨 ふぶき",          "karate", "blizzard",  "white",   "long"),
    ("dragon",     "🐉 ドラゴン",        "karate", "dragon",    "mint",    "long"),
    ("shadow",     "🌑 かげ",            "karate", "shadow",    "violet",  "long"),
    ("rainbow",    "🌈 にじ",            "karate", "rainbow",   "white",   "long"),
    ("boltViolet", "💜 むらさきの雷",    "karate", "lightning", "violet",  "long"),
    ("flameBlue",  "💙 あおい ほのお",   "karate", "flame",     "sky",     "long"),
    ("flameEmber", "🌋 まぐま",          "karate", "flame",     "ember",   "long"),
    ("iceWhite",   "🧊 ダイヤの こおり", "karate", "ice",       "silver",  "long"),
    ("kiRed",      "🔴 あかい オーラ",   "karate", "aura",      "red",     "long"),
    ("kiGold",     "🟡 きんの オーラ",   "karate", "aura",      "gold",    "long"),
    ("dragonRed",  "🔥 ひの ドラゴン",   "karate", "dragon",    "red",     "long"),
    ("sparkleGold","🌟 きんの きらめき", "karate", "sparkle",   "gold",    "long"),
    ("waterTeal",  "🌊 おおなみ",        "karate", "water",     "teal",    "long"),
    ("windGold",   "💨 かみかぜ",        "karate", "wind",      "gold",    "long"),
    ("shadowMag",  "🟣 やみ",            "karate", "shadow",    "magenta", "long"),
    ("boltIndigo", "🌩 かみなりの王",    "karate", "lightning", "indigo",  "long"),
    # ── ピアノ ─────────────────────────────────────────────────────────
    ("pnSpark",    "✨ きらり",          "piano",  "sparkle",   "cream",   "start"),
    ("pnAura",     "🤍 やさしい ひかり", "piano",  "aura",      "white",   "start"),
    ("pnPetal",    "🌸 はなびら",        "piano",  "petal",     "petal",   "short"),
    ("pnWater",    "💧 しずく",          "piano",  "water",     "sky",     "short"),
    ("pnRibbon",   "🎀 リボン",          "piano",  "ribbon",    "pink",    "short"),
    ("pnSnow",     "❄️ ゆき",            "piano",  "ice",       "ice",     "short"),
    ("pnWind",     "🌪 そよかぜ",        "piano",  "wind",      "mint",    "short"),
    ("pnRainbow",  "🌈 にじ",            "piano",  "rainbow",   "white",   "long"),
    ("pnBlizzard", "🌨 ふぶき",          "piano",  "blizzard",  "white",   "long"),
    ("pnSparkGold","🌟 きんの きらめき", "piano",  "sparkle",   "gold",    "long"),
    ("pnBolt",     "⚡️ いなずま",        "piano",  "lightning", "gold",    "long"),
    ("pnDragon",   "🐉 ドラゴン",        "piano",  "dragon",    "violet",  "long"),
    ("pnFlame",    "🔥 ほのお",          "piano",  "flame",     "orange",  "long"),
    ("pnAuraGold", "🟡 きんの ひかり",   "piano",  "aura",      "gold",    "long"),
]

# 描きかたの数値。style ごとに固定で、1つずつ手で持たない。
def _style(**kw):
    d = dict(opacity=0.92, radius=0.034, trailSeconds=0.12, burstSeconds=0.40, maxAnchors=2)
    d.update(kw)
    return d

STYLE = {
    "lightning": _style(opacity=0.95, trailSeconds=0.10),
    "flame":     _style(opacity=0.95),
    "ice":       _style(opacity=0.95, trailSeconds=0.08),
    "blizzard":  _style(opacity=0.90, trailSeconds=0.16),
    "water":     _style(opacity=0.88, trailSeconds=0.16),
    "wind":      _style(opacity=0.88, trailSeconds=0.14),
    "sparkle":   _style(opacity=0.95, trailSeconds=0.10),
    "petal":     _style(opacity=0.92, trailSeconds=0.12),
    "shadow":    _style(opacity=0.85, trailSeconds=0.14),
    "dragon":    _style(opacity=0.92, trailSeconds=0.14),
    "rainbow":   _style(opacity=0.90),
    "aura":      _style(opacity=0.88, trailSeconds=0.14),
    "ribbon":    _style(opacity=0.92),
}

presets = []
for pid, name, mode, style, colour, tier in CATALOG:
    r, g, b = C[colour]
    p = {"id": pid, "name": name, "mode": mode, "style": style,
         "color": {"red": r, "green": g, "blue": b, "alpha": 1}, **STYLE[style]}
    presets.append(p)

# 形（glyph）はもう無い。かざりは骨に沿って描くので、貼る絵が要らない。
out = os.path.join(ROOT, "ios/App/App/PracticeMotionFX/Effects.json")
with open(out, "w") as f:
    json.dump({"schemaVersion": 2, "presets": presets, "glyphs": []}, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("wrote", out, f"({len(presets)} presets)")

# ── 画面用（TypeScript）─────────────────────────────────────────────────
rows = []
for pid, name, mode, style, colour, tier in CATALOG:
    r, g, b = C[colour]
    hexcol = "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))
    rows.append(f'  {{ id: "{pid}", name: "{name}", mode: "{mode}", style: "{style}", '
                f'tier: "{tier}", color: "{hexcol}" }},')

ts = '''// ✨キラキラ の一覧 — 名前・色・描きかた・どうやったら手に入るか。
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
''' + "\n".join(rows) + '''
];
'''
tsout = os.path.join(ROOT, "karate-trainer/src/sparkle-catalog.ts")
open(tsout, "w").write(ts)
print("wrote", tsout)
