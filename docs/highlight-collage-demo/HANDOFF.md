# Claudeへの引き継ぎ — 2026-09-30 / 第八版

## 最新の合意
ユーザーは現在のテンプレートを了承。Hookを中央3行同時表示に戻した状態が最新。

- 35参照＝35テンプレート。3895は9マスで1枚、3897は6マスで1枚。
- 0秒からコラージュ＋Hook全文「一番の技、／どれですか？／教えてください」を3行同時表示。M PLUS Rounded 1c ExtraBoldを維持し、色は選択したコラージュから取得。
- 元録画冒頭の声を使用。先頭無音0.2645秒を除去し0秒から再生。デモのHook終了は仮の4秒。
- 右下は縦長のハイライト1本のみ。3秒・3秒・4秒の時計はHook中も進行。4秒から現在位置のまま拡大し、10秒から本編。再生し直さない。
- 本編は元動画4秒以降。現在位置と3つの見どころを表示。
- 白黒を残し、有彩色はロゴ並みの高彩度・高明度。固定S/Vで全役割色の色相を同角度回転。抽選は生成時、再試行中は保持。淡いパステルに戻さない。
- 3907/3908：マスクなしなら実人物の背景切り抜き、マスクありならキャラクター。素材に足がないことを理由にキャラへ置換しない。
- 装飾英字は日本語・漢字へ。装飾数字は録画日付由来。3872はハート禁止。
- 顔・目・鼻・口・半顔・胸・腰など部位を認識して切り取り、人物と文字の前後関係を参照に合わせる。文字の縦横引き伸ばしは禁止。
- 本番の認識・加工はすべてiPhone端末内。録画時の「かくす」設定を全素材へ引き継ぐ。

## 現状と限界
これはMac生成のローカル構図・動画デモ。本番アプリには未接続。
`../アランの基盤/ios/AlanKit/Sources/AlanKit/Collage*.swift` に部位・静止画加工・配色・タイムラインの共通部品あり。35案の完全なネイティブレンダラーではない。

未完：プライバシー設定の実接続、音声終了時刻の自動取得、シーンの自動選択、全テンプレートのiPhone描画、最終書き出し統合、実機性能計測。現在のキラキラは仮配置で姿勢追跡ではない。
元録画の顔が小さく、拡大画質・輪郭に限界あり。焼き込み済みの文字・装飾は残る。横顔・足先までの全身は入力にない。

## ファイル
- `index.html` / localhost:8756：35案の参照比較、動画、構図のみ、配色甲乙。
- `plates/` 70枚、`frames/` 70枚、`videos/` 35本。動画は540×960/30fps、1136フレーム＝37.8667秒。
- `checks/verification.json`：全35動画、70静止画、冒頭画像照合の検証成功。
- `checks/vivid-palette.json`：72角度で高彩度・高明度を確認。
- `checks/revision8-three-lines.png`：最新画面。
- `design-contracts.json`：構図仕様。実行可能な全ネイティブテンプレートではない。
- `tools/highlight-collage-demo/`：Python描画とSwift素材抽出。

## 再生成
macOS、PythonのPillow/numpy/imageio-ffmpeg、macOS日本語フォントを使用。
既存の素材からHookだけ変える場合はvideo.py→gallery.py→verify.py。配色を抽選し直す必要はない。
全構図を作り直す場合はrefine.py→more.py→additions.py→contracts.py→video.py→gallery.py→verify.pyの順。
旧build.pyとarchive/は履歴用。実行すると旧案へ戻るため使わない。

入力録画はmanifest.jsonのsource（/Users/uk/Downloads配下）にあるローカルMP4。参照・抽出素材・描画結果はこのフォルダ。正式キャラ素材は隣の基盤リポジトリに依存。

起動：`python3 -m http.server 8756 --bind 127.0.0.1 --directory docs/highlight-collage-demo`

## コミットの範囲
空手側はこのデモと生成ツール。基盤側はCollage共通部品・関連テスト・SERIES_GUIDE/PENDING。
空手の既存alan-icons、alan-privacy、tokens、plan-store、style、publicのアイコン・woff2変更は別件として未コミットのまま維持。
生成途中のstaging/と旧v1/はローカルに保持しGit除外。pushはしていない。
