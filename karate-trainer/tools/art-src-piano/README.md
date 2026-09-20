# ピアノのアイコンとトロフィーの元画像

- `icon.webp` … アプリアイコン（1254x1254、白背景）
- `trophy.png` … 優勝トロフィー（250x250、背景透明）

作り直すときはリポジトリのルートから `tools/make-piano-art.swift` を実行します。
白でぬりつぶしてから正方形に縮小し、アルファチャンネルを消します
（iOS のアプリアイコンはアルファを持てません）。

```
swift karate-trainer/tools/make-piano-art.swift
```

出力先:

| 出力 | 大きさ |
| --- | --- |
| `ios/App/App/Assets.xcassets/AppIcon-Piano.appiconset/AppIcon-512@2x.png` | 1024 |
| `public-piano/icons/icon-512.png` / `icon-180.png` / `favicon-32.png` | 512 / 180 / 32 |
| `public-piano/badges/victory_trophy.jpg` | 512 |

トロフィーの元が 250px しかないので、`done-trophy-img`（140pt）を @3x で見ると
少しやわらかく見えます。大きい元画像ができたら差し替えてください。
