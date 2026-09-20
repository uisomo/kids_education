# ピアノのかざりの元画像

`public-piano/images/decor-*.png` の元です。空手版（`decor-src/`）と同じ作り方で、
緑背景／白背景のまま置いてあります。作り直すときはリポジトリのルートから:

```
swift karate-trainer/tools/make-decor.swift karate-trainer/tools/decor-src-piano/frame-green.png frame karate-trainer/public-piano/images/decor-frame.png 1080 1920
```

ここに無いかざり（アラン・バナー）は空手版をそのまま使っています。
ピアノ版を作ったら、同じ名前・同じ大きさで `public-piano/images/` に置き、
`tools/make-piano-placeholders.swift` の `shared` からその行を消してください。
