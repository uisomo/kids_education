# ✨キラキラ を Mac で確かめる

実機に入れる前に、**アプリと同じコードで**練習動画を解析して、
実際のコマに かざりを重ねた jpg を出す。ffmpeg は要らない。

```bash
# かざりは いくつ並べてもよい（解析は1回だけ）
./tools/motionfx-harness/build.sh ~/Downloads/karate-training-XXXX.MP4 kiBlue star bolt
```

出るもの:

- タイムラインのコマ数／アンカーの出たコマ数／**印の発火回数**
- 出力コマの何％に何か描かれたか
- `proof/` に、かざりごとの「一番にぎやかな瞬間」と印の直後のコマ

`ios/App/App/PracticeMotionFX/` の Swift をコピーして `#if os(iOS)` を外し、
`import UIKit` を `CoreGraphics` に替えて固めているだけ。**アプリ側のロジックは
一切ここに複製していない** ので、数値を触ったらそのまま結果に出る。
30秒の動画で 90秒ほどかかる。

なぜこれが要るかは [`karate-trainer/MOTION_EFFECTS.md`](../../karate-trainer/MOTION_EFFECTS.md)
の「実写で測った話」に書いてある。
