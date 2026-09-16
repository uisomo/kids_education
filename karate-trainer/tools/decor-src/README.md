# かざりの元画像

`public/images/decor-*.png` の元です。緑背景／白背景のまま置いてあるので、
作り直すときはリポジトリのルートから:

```
swift karate-trainer/tools/make-decor.swift karate-trainer/tools/decor-src/frame-green.png  frame karate-trainer/public/images/decor-frame.png  1080 1920
swift karate-trainer/tools/make-decor.swift karate-trainer/tools/decor-src/icon-white.png   white karate-trainer/public/images/decor-icon.png    460  460
swift karate-trainer/tools/make-decor.swift karate-trainer/tools/decor-src/banner-white.png white karate-trainer/public/images/decor-banner.png  1080 405
```

白の抜き方はしきい値 251 の塗りつぶし（枠から届く白だけ）。これを下げると
アランの白い道着まで抜けます。
