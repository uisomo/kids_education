# ピアノのかざりの元画像

`public-piano/images/decor-*.png`（わく・アラン・バナー）の元です。
どれも背景が透明なので、大きさを変えるだけで使えます。リポジトリのルートから:

```
sips -s format png -z 1920 1080 karate-trainer/tools/decor-src-piano/frame-alpha.png  --out karate-trainer/public-piano/images/decor-frame.png
sips -s format png -z  460  460 karate-trainer/tools/decor-src-piano/icon-alpha.png   --out karate-trainer/public-piano/images/decor-icon.png
sips -s format png -z  405 1080 karate-trainer/tools/decor-src-piano/banner-alpha.png --out karate-trainer/public-piano/images/decor-banner.png
```

背景が白や緑のままの素材を使うときだけ、`tools/make-decor.swift` で先に切り抜きます
（使い方は `tools/decor-src/README.md`）。
