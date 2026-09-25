# ✨キラキラ の形。-0.5..0.5 の正方形、Y は下向き（Swift 側と同じ座標）。
# ここは「形」だけ。名前・色・アンロックの決まりは gen.py にある。
import json, math

def poly(*pts): return [{"x": round(x, 4), "y": round(y, 4)} for x, y in pts]

def star_pts(n=5, outer=0.5, inner=0.21, phase=-90.0):
    out = []
    for i in range(n * 2):
        a = math.radians(phase + i * (360.0 / (n * 2)))
        r = outer if i % 2 == 0 else inner
        out.append((r * math.cos(a), r * math.sin(a)))
    return out

def heart_pts(steps=40):
    # 定番の心臓曲線。上が凹み、下がとがる。
    raw = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        raw.append((x, y))
    mx = max(max(abs(x) for x, _ in raw), max(abs(y) for _, y in raw))
    return [(x / mx * 0.5, y / mx * 0.5) for x, y in raw]

def flame_pts():
    # 🔥 縦長のしずくに、左下から立ち上がる小さな舌を1つ。丸い葉っぱに見えないよう
    # 上の1/3をぐっと細くする。
    return [(0.02, -0.50), (0.13, -0.30), (0.21, -0.10), (0.29, 0.12), (0.24, 0.35),
            (0.05, 0.49), (-0.15, 0.45), (-0.27, 0.29), (-0.28, 0.08), (-0.17, -0.07),
            (-0.24, -0.27), (-0.10, -0.23), (-0.05, -0.37)]

def bolt_pts():
    # かみなり。上から下へ ジグザグ1回。太めの胴。
    return [(0.30, -0.50), (-0.34, 0.04), (-0.04, 0.04),
            (-0.26, 0.50), (0.34, -0.10), (0.04, -0.10)]

def flower_pts(petals=5, steps=60):
    out = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        r = 0.32 + 0.18 * abs(math.cos(petals * t / 2))
        out.append((r * math.cos(t - math.pi / 2), r * math.sin(t - math.pi / 2)))
    mx = max(max(abs(x) for x, _ in out), max(abs(y) for _, y in out))
    return [(x / mx * 0.5, y / mx * 0.5) for x, y in out]

def burst_pts(spikes=10, outer=0.5, inner=0.24):
    return star_pts(n=spikes, outer=outer, inner=inner, phase=-90.0)

def note_head_and_stem():
    # おんぷ（四分音符）。塗りで見せるので、玉は楕円、旗は三角。
    head = []
    for i in range(26):
        t = 2 * math.pi * i / 26
        # ななめの楕円
        ex, ey = 0.22 * math.cos(t), 0.16 * math.sin(t)
        a = math.radians(-20)
        head.append((-0.12 + ex * math.cos(a) - ey * math.sin(a),
                     0.30 + ex * math.sin(a) + ey * math.cos(a)))
    stem = [(0.06, 0.30), (0.06, -0.46), (0.16, -0.46), (0.16, 0.30)]
    flag = [(0.16, -0.46), (0.44, -0.30), (0.40, -0.10), (0.16, -0.22)]
    return [head, stem, flag]

def snow_pts(arms=6):
    paths = []
    for i in range(arms):
        a = math.radians(-90 + i * 360.0 / arms)
        ex, ey = 0.5 * math.cos(a), 0.5 * math.sin(a)
        paths.append([(0, 0), (ex, ey)])
        for f in (0.55, 0.8):
            bx, by = ex * f, ey * f
            for s in (+1, -1):
                b = a + s * math.radians(45)
                paths.append([(bx, by), (bx + 0.17 * math.cos(b), by + 0.17 * math.sin(b))])
    # 枝の先が箱からはみ出すので、全体を入るまで縮める（Catalog.validate が
    # ±0.5 を超える点を弾く）。
    m = max(max(max(abs(x), abs(y)) for x, y in p) for p in paths)
    k = 0.5 / m
    return [[(x * k, y * k) for x, y in p] for p in paths]


def gem_pts():
    # 💎 カットしたダイヤ。上の台形＋下のとがり。
    return [(-0.22, -0.40), (0.22, -0.40), (0.44, -0.14), (0.0, 0.48), (-0.44, -0.14)]

def moon_pts(steps=30):
    # 🌙 まるい月から、ずらしたまるを抜く。交点の角度を出して弧を2本つなぐ
    # （まるごと引き算すると、まっすぐな切り口の「D」になってしまう）。
    R, r, cx = 0.5, 0.44, 0.26
    a = (R * R - r * r + cx * cx) / (2 * cx)
    h = math.sqrt(max(0.0, R * R - a * a))
    th = math.atan2(h, a)                      # 外周の交点
    ph = math.atan2(h, a - cx)                 # 内周の交点（中心 cx から見て）
    pts = []
    for i in range(steps + 1):                 # 外周: 交点から 反対まわりで もう一方へ
        t = th + (2 * math.pi - 2 * th) * i / steps
        pts.append((R * math.cos(t), R * math.sin(t)))
    for i in range(steps + 1):                 # 内周: 逆向きに戻る
        t = (2 * math.pi - ph) - (2 * math.pi - 2 * ph) * i / steps
        pts.append((cx + r * math.cos(t), r * math.sin(t)))
    rot = math.radians(-25)                    # 三日月らしく少し傾ける
    c, s = math.cos(rot), math.sin(rot)
    return [(x * c - y * s, x * s + y * c) for x, y in pts]

GLYPHS = [
    {"id": "star",   "label": "⭐ ほし",     "closed": True,  "fill": True,  "paths": [poly(*star_pts())]},
    {"id": "heart",  "label": "❤️ ハート",   "closed": True,  "fill": True,  "paths": [poly(*heart_pts())]},
    {"id": "bolt",   "label": "⚡️ かみなり", "closed": True,  "fill": True,  "paths": [poly(*bolt_pts())]},
    {"id": "flame",  "label": "🔥 ほのお",   "closed": True,  "fill": True,  "paths": [poly(*flame_pts())]},
    {"id": "flower", "label": "🌸 おはな",   "closed": True,  "fill": True,  "paths": [poly(*flower_pts())]},
    {"id": "burst",  "label": "💥 ドン",     "closed": True,  "fill": True,  "paths": [poly(*burst_pts())]},
    {"id": "note",   "label": "🎵 おんぷ",   "closed": True,  "fill": True,  "paths": [poly(*p) for p in note_head_and_stem()]},
    {"id": "snow",   "label": "❄️ ゆき",     "closed": False, "fill": False, "paths": [poly(*p) for p in snow_pts()]},
    {"id": "gem",    "label": "💎 ダイヤ",   "closed": True,  "fill": True,  "paths": [poly(*gem_pts())]},
    {"id": "moon",   "label": "🌙 つき",     "closed": True,  "fill": True,  "paths": [poly(*moon_pts())]},
    {"id": "spark",  "label": "✨ きらり",   "closed": True,  "fill": True,  "paths": [poly(*star_pts(n=4, outer=0.5, inner=0.10))]},
]

