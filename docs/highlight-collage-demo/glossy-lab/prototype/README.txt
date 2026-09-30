Review prototype v3 — 2026-09-30

URL: http://127.0.0.1:8756/glossy-lab/prototype/

Timeline at 30fps:
0–0.5s (15 frames): frozen thumbnail/First Frame.
0.5–1.8333s (40 frames): source 8s, Hook「一番の技、」.
1.8333–3.1667s (40 frames): source 12s, Hook「どれですか？」.
3.1667–4.5s (40 frames): source 22s, Hook「教えてください」.
4.5s onward: existing body from source 4s. No repeated 10-second highlight reel.
Hook text center: (360,640) on 720×1280; uniform .55→1 zoom over 9 frames.
Source-embedded text is unchanged. Full recorded frame fits inside the generated frame.
Voice begins after the 0.5s thumbnail. Total export: 971 frames, 32.3667s, 540×960.

One generated RGBA frame: assets/highlight-frame.png.
Exact imagegen prompt: assets/highlight-frame-prompt.txt.
Header「今日のハイライト」and scene count are crisp overlaid text.
Frame hue follows the template's Hook primary, retaining that hue for the black middle line.
Tinting preserves the source alpha and generated shading. No code-generated gloss or person sheen.

35 review videos use this motion/frame treatment.
7 generated Glossy thumbnail candidates: 3870,3879,3885,3889,3897,3900,3908.
The other 28 keep their original thumbnails; their whole-collage Glossy treatment is not complete.
3870 retains vertical bands/graph paper. 3879 retains diagonal tape/organic backings.
Other thumbnail designs must not be reduced to uniform colored photo boxes.

Build: python3 tools/highlight-collage-demo/glossy-prototype-v3.py [optional IDs]
Renderer: tools/highlight-collage-demo/glossy-hook-motion-v3.py.
verification-v3.json records frame counts and original-video hash preservation.
The old videos and production are untouched. Earlier v1/v2 exports remain for comparison.
