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
- ライブ（カメラ中の）エフェクトのファイルは **取り込んでいない**：
  `LiveMotionTracker.swift` / `FramePreprocessor.swift` / `OverlayViews.swift`。
  ハンドオフの指示どおりライブは無効のままで、フラグではなく「コードが無い」
  という形で止めてある。録画中の映像には一切手を入れない。

ロジック（MotionEngine / SceneBuilder / Timeline / Vision まわり）は未変更。
上流を更新するときは同じ 4 点だけ当て直すこと。

`MotionEffects.swift` はこのアプリ側のブリッジで、上流には無い。
