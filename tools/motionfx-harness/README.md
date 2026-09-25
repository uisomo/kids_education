# ✨キラキラ を Mac で確かめる

実機に入れる前に、**アプリと同じコードで**練習動画を解析して、
実際のコマに かざりを重ねた jpg を出す。ffmpeg は要らない。

```bash
# かざりは いくつ並べてもよい（解析は1回だけ）
./tools/motionfx-harness/build.sh ~/Downloads/karate-training-XXXX.MP4 boltGold flame kiRed

# 動く絵も見る（12.0秒から3秒ぶん）
FXCLIP=12 ./tools/motionfx-harness/build.sh ~/Downloads/karate-training-XXXX.MP4 boltGold
```

出るもの:

- タイムラインのコマ数／アンカーの出たコマ数／**印の発火回数**
- 出力コマの何％に何か描かれたか
- `proof/` に、かざりごとの「一番にぎやかな瞬間」と印の直後のコマ
- `FXCLIP=<開始秒>` を付けると、`proof/` に **動く絵（GIF・3秒）** も出る。
  **回るものは静止画では確かめられない** ので、渦や稲妻をいじったら必ず見る

`ios/App/App/PracticeMotionFX/` の Swift をコピーして `#if os(iOS)` を外し、
`import UIKit` を `CoreGraphics` に替えて固めているだけ。**アプリ側のロジックは
一切ここに複製していない** ので、数値を触ったらそのまま結果に出る。
30秒の動画で 90秒ほどかかる。

なぜこれが要るかは [`karate-trainer/MOTION_EFFECTS.md`](../../karate-trainer/MOTION_EFFECTS.md)
の「実写で測った話」に書いてある。
