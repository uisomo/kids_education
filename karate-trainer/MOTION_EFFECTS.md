# ✨キラキラ（動きのエフェクト）

練習の動画に、手首・足首（ピアノは手のひら）の動きに合わせた
**細い輪郭だけ** のかざりを乗せる。子どもが見返したくなるように。

元になったのは `~/Downloads/PracticeMotionFX`（Swift パッケージ + ハンドオフ）。
取り込みかたと上流との差分は
[`ios/App/App/PracticeMotionFX/README.md`](../ios/App/App/PracticeMotionFX/README.md)。

## 決めたこと

- **録画には一切さわらない。** `CameraSession` / `AVCaptureMovieFileOutput` /
  音声 / 保存キュー / 焼き込み（`OverlayCompositor`）は変更なし。キラキラは
  「保存が終わった動画」を読んで **別ファイル** を書くだけ。
- **カメラ中のライブ表示はしない。** ハンドオフの指示どおり。フラグで隠すのでは
  なく、上流のライブ用ファイル 3 つを取り込んでいない。画面に重ねたものは
  どのみち録画には入らないので、「見えているのに保存されない」を作らない。
- **いつでも もとに戻せる。** done 画面の「なし」で元の動画に戻る。保存・送信は
  そのとき画面に出ているほうを使う。
- **初期値はオフ。** 押さなければ何も起きないし、何も作られない。
- 通信・アップロード・課金・外部サービス・学習モデルのダウンロードは無し。
  解析結果（JSON）は端末の中だけ。
- iOS 17 未満では機能ごと出ない（`available: false`）。アプリの最低 iOS は
  15.0 のまま上げていない。

## 流れ

```
保存ずみの mp4
  └ VideoMotionAnalyzer.analyze      Vision（体 or 手のポーズ）→ MotionEngine
      └ EffectTimeline (JSON)        Application Support/KarateRecorder/motionfx/
          └ VideoEffectsExporter     SceneBuilder → EffectPainter → CoreImage
              └ <もとの名前>-fx-<かざり>-100.mp4   （tmp。元ファイルはそのまま）
```

- 解析結果は動画ごとに取っておく。かざりを変えても解析はやり直さない
  （書き出しだけ）。動画が消えたら解析結果も消える。
- 同じ「動画 × かざり」の mp4 が既にあれば作り直さず、それを出す。
- 「やめる」で書きかけのファイルは消える。**元の動画は触っていない。**

## 出てくる名前

| 画面 | preset id | 見るところ |
|---|---|---|
| ⚡️ いなずま（既定・空手） | `quietLightning` | 手首・足首 |
| 🟢 わっか | `mintHalo` | 同上 |
| 💜 リボン | `ribbonTrail` | 同上 |
| 🧡 けりのこ | `softKick` | 足首だけ |
| 🤍 しんじゅ（既定・ピアノ） | `pianoPearl` | 手のひら |
| 🎵 おんぷ | `pianoNotes` | 同上 |

空手か ピアノかは **ビルド**（`VITE_APP_FLAVOR`）で決める。動画の中身から
当てたりはしない。

## これは何をしないか

技の良し悪しを見ない。突きの数を数えない。ピアノの音やタッチを見ない。
顔を認識しない。人物を identify しない。**かざりは飾りで、評価ではない。**

追跡が怪しいときは、まちがったところに出すより **出さない**。顔まわりは
（体の点から推定した範囲で）避けるが、指や体に一切かからない保証ではない。
気になったら「なし」に戻せる。

「動きを減らす」（iOS のアクセシビリティ）を入れている端末では、輪だけの
静かな絵になる。

## 元の動画との違い

キラキラ版は **SDR**、長辺 最大 1920px、音は入るが再エンコードされる。
HDR やフル解像度が要るときは元の動画のほうを保存する。

## けいこ中のキラキラ（画面だけ・2026-09-25 時点で調査中）

家族タブ →「稽古中のキラキラ」で親が選ぶ。既定はオフ。選ばれていなければ
解析用のカメラ出力自体を足さないので、負荷はゼロ。

**保存される動画には入らない。** 録画は `AVCaptureMovieFileOutput` が
カメラの絵をそのまま書いていて、画面に重ねたものは入りようがない。
入れるには録画を `AVAssetWriter` に置き換えることになり、音声・PTS・中断復帰・
保存キューを作り直すことになる（＝やっていない）。

作り: `AVCaptureVideoDataOutput` をもう一本足し、プレビュー・録画と同じ
90°回転＋左右反転をかけて Vision に渡す。だから overlay 側では反転を
掛け直さない（`mirrored: false`、`contentMode: .fill`）。
かざりはプレビューの上・web 画面の下の透明ビューに 30fps で描き、
**絵が変わらないコマは描き直さない**。

録画への配慮:
- `alwaysDiscardsLateVideoFrames` は解析出力にだけ付ける（録画は別の出力）
- コマは 1 枚ずつしか受け取らず、返事を待たない。`submit` が false でも
  そのコマは録画されている
- 熱・低電力で回数を落とし、critical で消える。**録画は止めない**
- 中断で消し、復帰で出し直す

### iPhone 16 実機の実測（2026-09-25）

| | |
|---|---|
| 追跡 | 15fps（目標どおり）／thermal 1 のときは 8fps に制限される |
| 1コマ | 13〜15ms |
| 向き | `size 720x1280` = 縦長。回転は効いている |
| 検出 | **体が 2割前後のコマでしか見つからず、手首はほぼ取れない** ← 未解決 |

途中で見つけて直したもの:
- **Vision の初回モデル読み込みが 7.1 秒**。`TrackingBudget` がそれを見て追跡を
  2fps まで落とし、平均が下がるのに十数秒かかるため、短い稽古は前半まるごと
  死んでいた。しかも 2fps だと `MotionEngine` が毎コマ状態を捨てる（0.3秒ルール）
  ので energy が常に 0 になり、**検出が完璧でも何も描けない**。
  → `VisionWarmUp` でプレビュー開始時に空回しして解決（0.5秒）。

### 残っている宿題

手首が取れない理由が未特定。いま `LiveMotionOverlay` は調査用の設定:
`longestAnalysisEdge: 960`（既定 640）、`minimumConfidence: 0.25`（既定 0.45）。
ログの `best` が実際に取れた手首の信頼度なので、その分布を見てから
**しきい値を決め直すこと**。低いまま出荷しない — 確信の無い点に描くより、
出さないほうがいい。

次にやると早いのは、**実機で録った練習動画を macOS 側で同じ Vision に
かけて検出率を見ること**（シミュレータでは body pose が動かないが、macOS では
動く）。画面の写りかたと切り離して、検出そのものを測れる。

## 確かめかた

`MotionEffectsSelfTest`（`#if DEBUG` のみ）。Vision を通す本番どおりの経路と、
作りもののタイムラインで描画だけを見る経路の 2 本を走らせる。

```bash
APP=$(xcrun simctl get_app_container booted com.alan.karate data)
cp なにかの動画.mp4 "$APP/tmp/motionfx-selftest.mp4"
SIMCTL_CHILD_MOTIONFX_SELFTEST=1 xcrun simctl launch --console-pty booted com.alan.karate
```

**シミュレータでは Vision の `VNDetectHumanBodyPoseRequest` が動かない**
（"Unable to setup request"）。描画・合成・書き出しはシミュレータで確かめられる
が、検出そのものは実機でしか見られない。
