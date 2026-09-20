# かざりの元画像

`public/images/decor-*.png`（と 積み重ね タブの階段アイコン）の元です。
新しい素材はもともと背景が透明なので、大きさを変えるだけで使えます。
リポジトリのルートから:

```
sips -z 1920 1080 karate-trainer/tools/decor-src/frame-alpha.png  --out karate-trainer/public/images/decor-frame.png
sips -z  405 1080 karate-trainer/tools/decor-src/banner-alpha.png --out karate-trainer/public/images/decor-banner.png
sips -z  460  460 karate-trainer/tools/decor-src/icon-alpha.png   --out karate-trainer/public/images/decor-icon.png
sips -z  128  128 karate-trainer/tools/decor-src/stairs-alpha.png --out karate-trainer/public/images/nav-strength.png
```

背景が白や緑のままの素材を使うときだけ、`tools/make-decor.swift` で先に
切り抜きます（しきい値 251 の塗りつぶし。下げるとアランの白い道着まで抜けます）:

```
swift karate-trainer/tools/make-decor.swift <in.png> frame|white <out.png> <width> <height>
```
