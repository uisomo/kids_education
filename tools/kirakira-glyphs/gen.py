#!/usr/bin/env python3
# ✨キラキラ の元になる表。ここを直して `python3 tools/kirakira-glyphs/gen.py` を
# 走らせると、2つのファイルが書き直される:
#
#   ios/App/App/PracticeMotionFX/Effects.json   ネイティブが描くときの形と色
#   karate-trainer/src/sparkle-catalog.ts       画面（キラキラのタブ）に出す名前と絵
#
# 同じものを2か所で手書きすると、必ず片方がずれる。名前・色・アンロックの
# 決まりは **この表だけ** が持つ。
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapes import GLYPHS

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# tier — どうやったら手に入るか。決まりの本体は sparkle-store.ts。
#   start … はじめから使える
#   short … 3分以上のメニューを、休まず最後までやりきったら1つ
#   long  … 休憩なしの5分以上を、最後までやりきったら1つ
#
# style — ネイティブの描きかた。
#   orb     … こぶし（手首・足首）そのものを光らせる。ドラゴンボールの気。
#   sticker … 強く動いた瞬間に、大きな塗りの印を出す
#   halo    … 輪だけ。いちばん静か。
C = {
    "gold":   (1.00, 0.84, 0.10), "pink":  (1.00, 0.36, 0.56), "orange": (1.00, 0.48, 0.10),
    "petal":  (1.00, 0.56, 0.78), "lemon": (1.00, 0.94, 0.35), "sky":    (0.35, 0.82, 1.00),
    "ice":    (0.75, 0.94, 1.00), "cream": (1.00, 0.95, 0.66), "cyan":   (0.50, 0.89, 1.00),
    "moon":   (1.00, 0.88, 0.54), "mint":  (0.32, 0.80, 0.67),
    "red":    (1.00, 0.24, 0.16), "blue":  (0.20, 0.55, 1.00),
}

# id, 画面の名前, mode, style, glyph, 色, tier
CATALOG = [
    # ── 空手 ───────────────────────────────────────────────────────────
    ("kiBlue",   "🔵 あおい パワー", "karate", "orb",     None,     "blue",   "start"),
    ("star",     "⭐️ ほし",         "karate", "sticker", "star",   "gold",   "start"),
    ("heart",    "💗 ハート",        "karate", "sticker", "heart",  "pink",   "short"),
    ("flower",   "🌸 おはな",        "karate", "sticker", "flower", "petal",  "short"),
    ("moon",     "🌙 つき",          "karate", "sticker", "moon",   "moon",   "short"),
    ("snow",     "❄️ ゆき",          "karate", "sticker", "snow",   "ice",    "short"),
    ("ring",     "🟢 わっか",        "karate", "halo",    None,     "mint",   "short"),
    ("kiRed",    "🔴 あかい パワー", "karate", "orb",     None,     "red",    "long"),
    ("bolt",     "⚡️ かみなり",      "karate", "sticker", "bolt",   "gold",   "long"),
    ("flame",    "🔥 ほのお",        "karate", "sticker", "flame",  "orange", "long"),
    ("burst",    "💥 ドン",          "karate", "sticker", "burst",  "lemon",  "long"),
    ("gem",      "💎 ダイヤ",        "karate", "sticker", "gem",    "cyan",   "long"),
    ("kiGold",   "🟡 きんの パワー", "karate", "orb",     None,     "gold",   "long"),
    # ── ピアノ ─────────────────────────────────────────────────────────
    ("pnSpark",  "✨ きらり",        "piano",  "sticker", "spark",  "cream",  "start"),
    ("pnNote",   "🎵 おんぷ",        "piano",  "sticker", "note",   "sky",    "start"),
    ("pnHeart",  "💗 ハート",        "piano",  "sticker", "heart",  "pink",   "short"),
    ("pnFlower", "🌸 おはな",        "piano",  "sticker", "flower", "petal",  "short"),
    ("pnMoon",   "🌙 つき",          "piano",  "sticker", "moon",   "moon",   "short"),
    ("pnSnow",   "❄️ ゆき",          "piano",  "sticker", "snow",   "ice",    "short"),
    ("pnStar",   "⭐️ ほし",         "piano",  "sticker", "star",   "gold",   "long"),
    ("pnKiBlue", "🔵 あおい パワー", "piano",  "orb",     None,     "blue",   "long"),
    ("pnGem",    "💎 ダイヤ",        "piano",  "sticker", "gem",    "cyan",   "long"),
    ("pnBurst",  "💥 ドン",          "piano",  "sticker", "burst",  "lemon",  "long"),
]

# 描きかたの数値。style ごとに固定で、1つずつ手で持たない。
STYLE = {
    "orb":     dict(opacity=0.85, radius=0.034, trailSeconds=0.10, burstSeconds=0.40, maxAnchors=2),
    "sticker": dict(opacity=0.95, radius=0.034, trailSeconds=0.12, burstSeconds=0.40, maxAnchors=2),
    "halo":    dict(opacity=0.70, radius=0.032, trailSeconds=0.06, burstSeconds=0.40, maxAnchors=2),
}

presets = []
for pid, name, mode, style, glyph, colour, tier in CATALOG:
    r, g, b = C[colour]
    p = {"id": pid, "name": name, "mode": mode, "style": style,
         "color": {"red": r, "green": g, "blue": b, "alpha": 1}, **STYLE[style]}
    if glyph: p["glyph"] = glyph
    presets.append(p)

used = {g for _, _, _, _, g, _, _ in CATALOG if g}
glyphs = [{"id": g["id"], "closed": g["closed"], "fill": g["fill"], "paths": g["paths"]}
          for g in GLYPHS if g["id"] in used]
missing = used - {g["id"] for g in glyphs}
assert not missing, f"形が無いグリフ: {missing}"

out = os.path.join(ROOT, "ios/App/App/PracticeMotionFX/Effects.json")
with open(out, "w") as f:
    json.dump({"schemaVersion": 2, "presets": presets, "glyphs": glyphs}, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("wrote", out, f"({len(presets)} presets / {len(glyphs)} glyphs)")

# ── 画面用（TypeScript）─────────────────────────────────────────────────
def svg_d(g):
    return " ".join(
        "M " + " L ".join(f"{q['x']} {q['y']}" for q in path) + (" Z" if g["closed"] else "")
        for path in g["paths"])

by_id = {g["id"]: g for g in GLYPHS}
rows = []
for pid, name, mode, style, glyph, colour, tier in CATALOG:
    r, g_, b = C[colour]
    hexcol = "#%02x%02x%02x" % (round(r * 255), round(g_ * 255), round(b * 255))
    shape = "null" if not glyph else json.dumps(
        {"d": svg_d(by_id[glyph]), "fill": by_id[glyph]["fill"]}, ensure_ascii=False)
    rows.append(f'  {{ id: "{pid}", name: "{name}", mode: "{mode}", style: "{style}", '
                f'tier: "{tier}", color: "{hexcol}", shape: {shape} }},')

ts = '''// ✨キラキラ の一覧 — 名前・色・形・どうやったら手に入るか。
//
// **手で書き換えないこと。** 元は tools/kirakira-glyphs/gen.py の表で、
//   python3 tools/kirakira-glyphs/gen.py
// を走らせると、このファイルと ios/.../Effects.json の両方が書き直される。
// ネイティブ（描くほう）と画面（集めるほう）で名前や形がずれないように。

export type SparkleTier = "start" | "short" | "long";

export interface SparkleShape {
  /// -0.5〜0.5 の箱に入った SVG のパス（Y は下向き）。キラキラのタブで使う。
  d: string;
  /// 塗りつぶすか、線だけか。
  fill: boolean;
}

export interface SparkleDef {
  id: string;
  name: string;
  mode: "karate" | "piano";
  style: "orb" | "sticker" | "halo";
  tier: SparkleTier;
  color: string;
  /// orb / halo には形が無い（まるく光るだけ）。
  shape: SparkleShape | null;
}

export const SPARKLES: SparkleDef[] = [
''' + "\n".join(rows) + '''
];
'''
tsout = os.path.join(ROOT, "karate-trainer/src/sparkle-catalog.ts")
open(tsout, "w").write(ts)
print("wrote", tsout)
