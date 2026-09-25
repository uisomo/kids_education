# ✨キラキラ の元になる表

名前・色・形・どうやったら手に入るか（tier）を **ここ一つ** が持っている。

```bash
python3 tools/kirakira-glyphs/gen.py
```

を走らせると、2つのファイルが書き直される:

| 出力 | だれが読むか |
|---|---|
| `ios/App/App/PracticeMotionFX/Effects.json` | ネイティブ（動画に描くほう） |
| `karate-trainer/src/sparkle-catalog.ts` | 画面（キラキラのタブで並べるほう） |

**どちらも手で書き換えないこと。** 同じものを2か所で書くと、必ず片方がずれる。

- `gen.py` … 表（id・名前・mode・style・glyph・色・tier）と、style ごとの数値
- `shapes.py` … 形そのもの。`-0.5〜0.5` の箱、Y は下向き（Swift と同じ座標）

## 形を足すとき

1. `shapes.py` に点を置いて `GLYPHS` に足す
2. `gen.py` の `CATALOG` に 1行足す
3. `python3 tools/kirakira-glyphs/gen.py`
4. **絵を見る。** `./tools/motionfx-harness/build.sh <練習動画> <新しいid>`

4 を飛ばさないこと。線だけの ⚡️ が「ただの落書き」に見えていたのに、
実機に入れるまで誰も気づかなかった（`karate-trainer/MOTION_EFFECTS.md`）。

箱（±0.5）からはみ出す点があると `Catalog.validate` が弾いてアプリが
かざりを1つも出さなくなる。`snow` のように枝が飛び出す形は縮めてから返す。
