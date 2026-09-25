# PracticeMotionFX（ベンダリングしたコピー）

`~/Downloads/PracticeMotionFX`（Swift パッケージ）の Sources をこのアプリの
ターゲットに取り込んだもの。SwiftPM の `.iOS(.v17)` 指定は、このアプリの
デプロイメントターゲット（iOS 15.0）と衝突してパッケージとしては足せないため、
ソースをそのまま置いて `@available(iOS 17.0, *)` で囲っている。

## 上流との差分（これだけ）

- `import PracticeMotionCore` を削除（1モジュールに同居するため）
- `Catalog.bundled()` の `Bundle.module` → `Bundle.main`（`Effects.json` は
  アプリ本体のリソースとして焼き込む）
- `VideoGeometry` / `VideoMotionAnalyzer` / `VideoEffectsExporter` に
  `@available(iOS 17.0, *)`。iOS 16 以下では ✨キラキラ のボタン自体が出ない。
- ライブ（カメラ中の）エフェクトのファイル
  （`LiveMotionTracker.swift` / `FramePreprocessor.swift` / `OverlayViews.swift`）は
  あとから取り込んだ。親が選んだときだけ動く画面表示で、**録画される映像には
  入らない**（録画は `AVCaptureMovieFileOutput` のまま。一切手を入れていない）。
- **実写に合わせた数値の調整（2026-09-26）。** 上流の既定値のままだと、実際の
  練習動画では かざりが出ない／出ても見えなかった。実測は
  [`MOTION_EFFECTS.md`](../../../../karate-trainer/MOTION_EFFECTS.md) の
  「実写で測った話」を見ること。
  - `MotionEngine.swift`: 空手の ⚡️ 発火条件
    `speed>2.2 && radial>0.6 && extension>0.72` → `1.6 / 0.35 / 0.45`。
    肘か肩が取れないコマ用に `speed>1.8 && energy>0.35` のフォールバックを追加。
  - `Scene.swift`: 輪の太さ `0.0022`→`0.0048`、尾 `0.003`→`0.0042`（濃さ
    `0.55`→`0.70`）、濃さの式 `0.25+0.75*energy`→`0.55+0.45*energy`、
    顔よけの余白 `radius*2.4`→`radius*1.4`、グリフ `radius*1.05`→`radius*1.7`
    （線 `0.002`→`0.0042`、位置も少し上へ）。
- **「細い輪郭だけ」をやめた（2026-09-26・その2）。** 上流は「静かな飾り」を
  ねらって線だけで描いていたが、**子どもには何の絵か分からなかった**
  （⚡️ が ただの落書きに見える）。作り直したところ:
  - `Catalog.swift`: `schemaVersion` 1→**2**。`VectorGlyph.fill`（塗るか線か）と
    `EffectPreset.glyph`（どの形か）を追加。style は
    `lightning/halo/ribbon/arc/pearl/notes` → **`orb` / `sticker` / `halo`** の
    3つだけに。上限も上げた（opacity 0.70→1.0、radius 0.035→0.045）。
  - `EffectPainter.swift`: グリフを **白いふち＋塗り** で描く（背景に溶けない）。
    `.orb` を追加＝`drawRadialGradient` で **こぶしそのものを光らせる**
    （ドラゴンボールの気。ユーザーの希望）。上限は
    `maxRadius 0.055→0.12` / `maxLineWidth 0.006→0.02` / `maxAlpha 0.70→1.0`。
    オーバーレイのラスタも 768→**1280**（塗りの輪郭が 1920 でぼやけるため）。
  - `Scene.swift`: sticker の大きさを **短辺の 9.5%** に固定（`radius*1.8` だと
    小さすぎた）。sticker の「手についてまわる印」は 細い輪 → 小さな `.orb` に
    （大きな印のとなりに ⊙ が並んで じゃまだった）。`arc`/`ribbon` の分岐は削除。
  - `Effects.json` は **手で書かない**。`tools/kirakira-glyphs/gen.py` が
    形（`shapes.py`）と表から、これと `karate-trainer/src/sparkle-catalog.ts` の
    両方を書き出す。

- **「形を貼る」のをやめた（2026-09-26・その3）。** 塗りのステッカーにしても
  ユーザーの答えは **「ダサい」**。宙に浮いた絵では、子どもはワクワクしない。
  かざりを **骨に沿わせる** 作りに変えた:
  - `Models.swift`: `FXLimb`（肩→肘→手首／尻→膝→足首）と `EffectFrame.limbs`。
    エンジンは肩と肘を もともと見ている（伸びぐあいの判定）ので、外に出すだけ。
    古い解析結果でも落ちないよう `EffectFrame` に手書きの `init(from:)`。
  - `Timeline.swift`: `schemaVersion` 1→**2**（骨の無い古い sidecar は読まずに
    取り直す。黙って腕のかざりが消えるのを防ぐ）。骨も補間する。
  - `Scene.swift`: `DisplayPath`（骨の上を道のりで歩く）と `wrap()`
    （骨に沿って左右にうねる折れ線）。`turns` が「ぐるぐる」、`phase` を時間で
    進めると回り続け、`jitter` で稲妻になる。両端は `sin(πu)` で骨に戻すので
    宙に浮かない。**display 空間（x に aspect を掛ける）で計算する** — 縦長の
    動画でそのまま計算すると、渦が横につぶれた楕円になる。
  - `EffectPainter.swift`: `.glow` を追加 = **同じ線を3回重ねる**
    （にじみ 3.4倍 0.22 → 色 1.7倍 0.45 → 白い芯 0.55倍 0.95、`plusLighter`）。
    エネルギーに見えるかどうかは ほぼこれで決まる。`.glyph` は削除。
  - style は `lightning` / `spiral` / `aura` の3つ。`glyphs` は Effects.json から
    抜いた（形は **キラキラのタブのアイコン専用** になった）。

- **裏づけの無い関節に高い信頼度を求める（2026-09-26・その4）。**
  `MotionEngine` に `unsupportedConfidence = 0.62`。肩・肘（尻・膝）が
  取れていない関節は、それだけでは信じない。実写で、画面外の足首を Vision が
  推測して焼き込んだ かざりの絵の上に置き、そこで技が決まっていた
  （`rightAnkle c=0.50 e=1.00`）。支えのある点は 0.45 のまま通す。

上流を更新するときは、この差分を当て直すこと。

`MotionEffects.swift` はこのアプリ側のブリッジで、上流には無い。
