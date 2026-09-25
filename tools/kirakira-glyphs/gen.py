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
# style — ネイティブの描きかた。**どれも「腕（肩→肘→手首）に沿って」描く。**
#   形を宙に貼るのはやめた（子どもが見てワクワクしないと、この機能の意味が無い）。
#   lightning … 腕にまとわりつく稲妻。枝分かれし、1秒に14回パチパチ引き直す
#   spiral    … 腕をぐるぐる回る帯。時間で回るので、止まっていても回り続ける
#   aura      … 腕ぜんたいが太く光って ゆっくり脈打つ。こぶしの気のたまが大きい
#
# どの style でも、こぶしは光り、突きが決まると衝撃波の輪が広がる。

C = {
    "gold":   (1.00, 0.84, 0.10), "pink":  (1.00, 0.36, 0.56), "orange": (1.00, 0.45, 0.08),
    "petal":  (1.00, 0.56, 0.78), "lemon": (1.00, 0.94, 0.35), "sky":    (0.35, 0.82, 1.00),
    "ice":    (0.62, 0.90, 1.00), "cream": (1.00, 0.95, 0.66), "cyan":   (0.30, 0.95, 0.92),
    "moon":   (1.00, 0.88, 0.54), "mint":  (0.32, 0.92, 0.60),
    "red":    (1.00, 0.22, 0.14), "blue":  (0.20, 0.55, 1.00), "violet": (0.70, 0.40, 1.00),
}

# id, 画面の名前, mode, style, 色, tier
CATALOG = [
    # ── 空手 ───────────────────────────────────────────────────────────
    ("kiBlue", "🔵 あおい オーラ", "karate", "aura", "blue", "start"),
    ("boltGold", "⚡️ いなずま", "karate", "lightning", "gold", "start"),
    ("flame", "🔥 ほのお", "karate", "spiral", "orange", "short"),
    ("wind", "🌀 かぜ", "karate", "spiral", "cyan", "short"),
    ("ice", "❄️ こおり", "karate", "lightning", "ice", "short"),
    ("heart", "💗 ハート", "karate", "spiral", "pink", "short"),
    ("kiRed", "🔴 あかい オーラ", "karate", "aura", "red", "long"),
    ("boltViolet", "💜 むらさきの雷", "karate", "lightning", "violet", "long"),
    ("dragon", "🐉 ドラゴン", "karate", "spiral", "mint", "long"),
    ("starGold", "⭐️ きらめき", "karate", "lightning", "lemon", "long"),
    ("kiGold", "🟡 きんの オーラ", "karate", "aura", "gold", "long"),
    # ── ピアノ ─────────────────────────────────────────────────────────
    ("pnSpark", "✨ きらり", "piano", "aura", "cream", "start"),
    ("pnNote", "🎵 おんぷ", "piano", "spiral", "sky", "start"),
    ("pnHeart", "💗 ハート", "piano", "spiral", "pink", "short"),
    ("pnMoon", "🌙 つき", "piano", "spiral", "moon", "short"),
    ("pnSnow", "❄️ ゆき", "piano", "lightning", "ice", "short"),
    ("pnFlower", "🌸 おはな", "piano", "spiral", "petal", "short"),
    ("pnStar", "⭐️ ほし", "piano", "lightning", "gold", "long"),
    ("pnKiBlue", "🔵 あおい オーラ", "piano", "aura", "blue", "long"),
    ("pnGem", "💎 ダイヤ", "piano", "spiral", "cyan", "long"),
]

# 描きかたの数値。style ごとに固定で、1つずつ手で持たない。
STYLE = {
    "lightning": dict(opacity=0.95, radius=0.034, trailSeconds=0.10, burstSeconds=0.40, maxAnchors=2),
    "spiral":    dict(opacity=0.92, radius=0.034, trailSeconds=0.12, burstSeconds=0.40, maxAnchors=2),
    "aura":      dict(opacity=0.88, radius=0.034, trailSeconds=0.14, burstSeconds=0.40, maxAnchors=2),
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
''' + "\n".join(rows) + '''
];
'''
tsout = os.path.join(ROOT, "karate-trainer/src/sparkle-catalog.ts")
open(tsout, "w").write(ts)
print("wrote", tsout)
