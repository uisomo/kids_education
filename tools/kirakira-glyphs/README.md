# ✨キラキラ の元になる表

名前・色・描きかた（style）・どうやったら手に入るか（tier）を
**ここ一つ** が持っている。

```bash
python3 tools/kirakira-glyphs/gen.py
```

を走らせると、2つのファイルが書き直される:

| 出力 | だれが読むか |
|---|---|
| `ios/App/App/PracticeMotionFX/Effects.json` | ネイティブ（動画に描くほう） |
| `karate-trainer/src/sparkle-catalog.ts` | 画面（キラキラのタブで並べるほう） |

**どちらも手で書き換えないこと。** 同じものを2か所で書くと、必ず片方がずれる。

`gen.py` が表（id・名前・mode・style・色・tier）と、style ごとの数値を持つ。
**形（貼る絵）はもう無い** — かざりは腕の骨に沿って描くので、絵が要らない。
タブのアイコンも style から描いている（`src/ui/sparkle-screen.ts`）。

## 1つ足すとき

1. `gen.py` の `CATALOG` に 1行足す（style は lightning / spiral / aura）
2. `python3 tools/kirakira-glyphs/gen.py`
3. **動く絵を見る。**
   `FXCLIP=12 ./tools/motionfx-harness/build.sh <練習動画> <新しいid>`

3 を飛ばさないこと。**回るものは静止画では確かめられない。** 細い輪郭の ⚡️ が
「ただの落書き」に見えていたのに、実機に入れるまで気づかなかった
（`karate-trainer/MOTION_EFFECTS.md` の「その3」「その4」）。

新しい描きかたを足したいときは `Scene.swift` の `switch style` と
`Catalog.validate` の許す名前、両方に足す。
