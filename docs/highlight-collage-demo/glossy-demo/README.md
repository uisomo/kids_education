# Glossy comparison checkpoint — 2026-09-30

## Superseded material policy — latest accepted direction

Read the newest section of `../HANDOFF.md` first. The user rejected code-generated gloss as fake and accepted the vivid 3900 whole-background image-generation direction. Current preview: `../glossy-lab/whole-gloss/`. Set brand-appropriate colors before generation, generate backgrounds/shapes without photos or text, then composite existing photos and crisp text with original coordinates and masks. No photo-interior sheen. The code-native material comparison described below is historical, not the selected policy. Expansion to all 35 templates has not been completed; approved videos and production remain unchanged.

## Follow-up color/material lab

`../glossy-lab/` compares 3886 and 3889 in six steps: current strong control, natural RGB/no halftone or added grain, broader resin reflections, colored Hook, tonal-color portraits, and pearl background. Artwork/Hook toggles expose 24 review images. Run `python3 tools/highlight-collage-demo/glossy-lab.py`. These are static candidates, not selected defaults or production/video changes. Existing cutout alpha and clipping geometry are retained. See its `verification.json` for image validation.

Open http://127.0.0.1:8756/glossy-demo/ (the existing local gallery server).

## Scope

All 35 templates: original + 3 glossy material levels. Each has artwork-only, approved 1/6 Hook, and a white-based Hook alternative; each also has original typography and optional rounded display typography. This is 840 review JPEGs plus 210 reflection masks, with some intentionally identical controls. No existing approved videos or production templates are replaced.

- 1 / restrained: colored shape coating, rounded rectangles, softened polygon tips.
- 2 / recommended: additionally slim raised photo/cutout edges and a soft upper-left-lit shadow.
- 3 / strong: level 2 artwork plus one brief moving glint; colored/white upper and lower Hook glyphs gain a small bevel. Black middle Hook stays flat.
- White Hook: white upper/lower fill, collage-primary outline, black offset shadow. Middle remains black fill / white outline / black shadow. This is a review candidate, not an automatic contrast decision.
- Rounded typography: only display text requested at >=45px, except explicitly handwritten/script text; M PLUS Rounded 1c ExtraBold. No stretched glyphs. Small annotations retain the template font. Baseline keeps its original font.
- 3900: original remains the comparison control; glossy candidates also have a friendly layout revision: light paper, lightly washed natural skin, rounded photo windows, handwritten text and small motifs outside pupils, removed dark scratch overlay. There is no need to turn every face into an illustration.

## Build

`python3 tools/highlight-collage-demo/glossy-demo.py`

Optional template IDs limit the build. Complete image sets are resumed. To force one template to regenerate, explicitly remove its generated output set from this directory first (do not delete approved parent outputs). The gallery HTML is hand maintained; data.json and verification.json are generated.

The material renderer is code-native (Pillow) and uses existing photo/shape alpha, not color-key segmentation. `refine.MATERIAL_COMPOSITOR` is optional and defaults to None. Additional callbacks cover inset portraits, 3889 overflow cutouts, 3894's composite silhouette and 3898's split portrait. Demo-only drawing/font adapters are installed within the builder and restored when it ends.

Original palette metadata and chosen Hook patterns are read, never rewritten. Grain remains in source prints. Photo interiors are not given a poster-wide shine overlay. Moving glint is browser Canvas, confined to bright new raised edge pixels. Reduced-motion skips autoplay. User may explicitly replay.

## Pending / do not claim complete

- User has not selected a final glossy material/rounded-font policy.
- No automatic background-aware Hook selection yet. Compare 3886, 3882, 3889, and potentially 3887; the user's trailing `38871no` was incomplete.
- Palette A only is shown in this material comparison; existing palette B is not rebuilt.
- Current demo uses existing low-resolution source faces and their limitations.
- This is still desktop rendering + browser sheen, not new MP4s or an iPhone implementation. Later port using existing privacy-approved alpha, cached masks and an on-device compositor; device performance and exports must be measured.
- Some neutral/handwritten templates intentionally have no applicable colored shapes or display headings, so a toggle may make little or no difference.

## Next chat

Read `docs/highlight-collage-demo/HANDOFF.md` and this file, inspect the comparison with the user, then choose which treatments become template-specific defaults. Preserve the previously approved 35 videos until that decision. Current changes are uncommitted; prior checkpoint commits are 7b3645b (karate) and a41b883 (shared foundation). Unrelated existing application edits must not be included accidentally.
