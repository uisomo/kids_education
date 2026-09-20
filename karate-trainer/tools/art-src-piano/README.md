# ピアノのアイコンとトロフィーの元画像

- `icon.webp` … アプリアイコン（1254x1254、白背景）
- `trophy.png` … 優勝トロフィー（250x250、背景透明）
- `notes.webp` … 14この音符のまとめ絵（1024x1536、白背景、タテに3つ×5段）

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

---

# 音符（レベルの絵）

`notes.webp` はしろ → きいろ → … → ドラゴン → でんせつ の順に、
左から右・上から下で並んでいます（最後の段だけ 2 こ）。
リポジトリのルートから切り出します。

```
swift karate-trainer/tools/make-piano-notes.swift
```

出力先: `public-piano/images/notes/note-01.png` 〜 `note-14.png`（256x256、背景透明）。
番号は `belt-store.ts` の `BELTS` の順番と同じで、`note-【index+1】.png` で引きます。

切り出しのしくみ:

- 白背景は「白い画素を消す」のではなく、**画像のふちからぬりつぶし**て消します。
  こうしないと、しろの音符自身や、もようの白いハイライトまで消えます。
- 段と列は **絵のあるところから探します**（5等分したら上の段の下はしが
  下の段に混ざりました）。絵を差しかえるときも、きっちりした格子でなくて
  かまいません。音符どうしのあいだは 8px 以上あけてください。
