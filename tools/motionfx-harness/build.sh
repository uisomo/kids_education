#!/bin/bash
# ✨キラキラ を macOS で確かめる。実機に入れる前にここで絵を見る。
#   ./tools/motionfx-harness/build.sh ~/Downloads/karate-training-XXXX.MP4 [preset ...]
# かざりは いくつ並べてもよい（解析は1回だけ走って、描くところだけ繰り返す）。
# アプリと同じ Swift ソースをコピーして、`#if os(iOS)` を外して固めるだけ。
# 結果は build 先の proof/ に jpg で出る。1本 90 秒くらいかかる。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/ios/App/App/PracticeMotionFX"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${MOTIONFX_BUILD_DIR:-$(mktemp -d)}"
mkdir -p "$OUT"
for f in Models Geometry MotionEngine Scene MusicScene AudioAnalyzer AudioTrackAnalyzer Timeline Catalog VisionPoseDetector VideoAnalyzer EffectPainter; do
  sed -e 's/#if os(iOS)/#if true/' -e 's/^import UIKit$/import CoreGraphics/' "$SRC/$f.swift" > "$OUT/$f.swift"
done
cp "$SRC/Effects.json" "$HERE/main.swift" "$HERE/render.swift" "$OUT/"
( cd "$OUT" && swiftc -O -o harness ./*.swift 2>&1 | grep -v -i "deprecat\|warning" | grep -v "^ *[0-9]* |\|^ *|\|^ *\`-\|^ *\^" || true )
echo "built in $OUT"
# 引数が動画1本だけのときは「作っただけ」で正常終了する（set -e に食われないよう
# 明示的に分ける）。
if [ $# -ge 1 ]; then
  video="$1"; shift
  ( cd "$OUT" && ./harness "$video" "${@:-kiBlue}" && echo "proof frames: $OUT/proof" )
fi
