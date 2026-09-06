# Karate Trainer: Post-Record Overlay Burn-In (ffmpeg.wasm)

Status: approved, not yet implemented
Related: [[karate-cloudflare-deploy]], [[karate-feature-towers]]

## Problem

Recording currently composites the camera video plus burned-in overlay text
(種目名 / countdown / 掛け声 / 工夫メモ) live, every frame, onto an offscreen
`<canvas>` via `CanvasCompositor`, and feeds `canvas.captureStream()` +
the camera's audio track into `MediaRecorder` (`canvas-compositor.ts`,
`recorder.ts`, `app.ts` `beginTraining`/`finishSession`).

This is fragile on iOS Safari / WKWebView specifically:

- **Audio silent in the saved recording** — Safari's `MediaRecorder` often
  fails to properly mux an audio track pulled from a *different* source
  stream (camera) onto a synthetic canvas video stream.
- **Video freezes ~20s in** — a known iOS Safari bug where
  `canvas.captureStream()` stops pumping new frames under load, so the
  last frame just repeats for the remainder of the recording.
- **Progress bar dead, but a file still saves** — Safari's
  `ondataavailable` firing differs from Chromium's under this same
  hybrid-stream setup; ordinarily this drives an incremental progress UI,
  but it fires sparsely or only once at `stop()`.

All three symptoms trace to the same root cause: mixing a canvas-based
video track with a separately-sourced audio track, then recording that
hybrid live via `MediaRecorder`, is not reliably supported on iOS WebKit.

## Goal

Keep the burned-in overlay text in the *saved/shared* video file (does not
need to render live — only needs to end up in the recorded material), while
making the live recording itself immune to the canvas/MediaRecorder bugs
above.

Out of scope for this spec: the native iOS App Store build will eventually
use `RPScreenRecorder` (ReplayKit) instead of any of this — that is a
separate future spec for the Capacitor-wrapped native app. This spec covers
the web/PWA build only.

## Approach

Decouple capture from compositing:

1. Record the **raw camera + mic stream directly** via `MediaRecorder` —
   no canvas in the live path at all. This alone eliminates all three bugs,
   since none of them can occur without a canvas-sourced stream in the
   live recording.
2. Log overlay state changes (already emitted via the existing
   `setState()` call sites in `app.ts`: `onDrillStart`, `onTick`,
   `onEncourage`, `onCountdown`, kufu caption changes) with timestamps,
   instead of drawing them live.
3. After recording stops, run an **offline burn-in pass** using
   `ffmpeg.wasm`: render each distinct overlay state as a transparent PNG
   (reusing the existing pill-background/text drawing code), then
   composite those PNGs onto the raw video with ffmpeg's `overlay` filter,
   each enabled only for its `[start, end)` time window.
4. The done screen shows the raw video immediately (instant playback, no
   wait) while burn-in runs in the background; when finished, it swaps in
   the burned-in version transparently. If burn-in fails for any reason,
   the raw video silently remains the final result — no error state, no
   retry UI.

### Why this approach over alternatives

- **Live drawtext/canvas fix attempts** (e.g. routing audio through Web
  Audio API into the same stream) might address the silent-audio bug but
  not the independent frame-freeze bug — both must be solved, and
  decoupling capture entirely solves both at once.
  - ffmpeg `drawtext` filter was considered for the burn-in step itself,
  but pre-rendering PNGs via the existing canvas drawing code guarantees
  pixel-identical output to today's design (rounded pill backgrounds,
  Hiragino Sans, existing colors) and avoids bundling a CJK font for
  ffmpeg plus fighting drawtext's more limited styling.

## Architecture

### Recording path (`app.ts`)

`beginTraining()`: drop the `makeCompositor`/`captureStream` branch.
Always call `recorder.startRecording()` with no `streamOverride` — records
the camera stream (video + audio) directly, matching the existing
`VideoRecorder.startCamera()` → `{ video, audio: true }` stream.

### Overlay event log (new: `overlay-event-log.ts`)

Replaces `canvas-compositor.ts` (which is deleted; its live-drawing
responsibility no longer exists in the recording path). Same shape as
`CompositorState`, same call sites:

```ts
export interface OverlayEvent {
  t: number; // ms since recording start
  patch: Partial<CompositorState>; // drill/seconds/cue/caption
}

export class OverlayEventLog {
  start(): void;                    // records t0
  setState(patch: Partial<CompositorState>): void; // pushes {t, patch}
  getEvents(): OverlayEvent[];
}
```

`app.ts` wiring is a near drop-in replacement: `this.compositor` becomes
`this.overlayLog`; `.start()`/`.setState()` calls stay at the same call
sites; `.stop()` is removed (no rAF loop to cancel); `captureStream()` is
removed (nothing to capture from — recording no longer depends on this
object at all).

The on-screen DOM overlay (`training-screen.ts`) is untouched — it already
renders overlay text independently via `view.setDrill`/`setTime`/`showCue`/
`setCaption`, which stays as the only *live* rendering.

### PNG rendering helper (new: shared module, e.g. `overlay-frame-render.ts`)

Extracted from `canvas-compositor.ts`'s `drawLabel`/`roundRect` (same
visual output: rounded pill background, `900 {size}px "Hiragino Sans"`,
existing colors per field). Takes a `CompositorState` snapshot, returns a
`Promise<Blob>` (transparent PNG) from an offscreen canvas sized to match
the target video resolution (720×1280, matching the current
`CANVAS_W`/`CANVAS_H` constants).

### Burn-in pipeline (new: `overlay-burner.ts`)

```ts
export async function burnOverlay(
  rawVideoBlob: Blob,
  events: OverlayEvent[],
  totalDurationMs: number,
): Promise<Blob | null> // null on any failure — caller falls back to raw
```

Steps:
1. Collapse `events` into distinct `(state, startMs, endMs)` segments
   (each segment's `endMs` = next event's `t`, last segment runs to
   `totalDurationMs`).
2. Render one PNG per segment via the PNG helper.
3. Load `@ffmpeg/ffmpeg` (multi-threaded core) lazily — only on first use,
   so it doesn't cost anything on the initial page load.
4. Write `input.<ext>` (raw video) + `overlay-N.png` files into ffmpeg's
   virtual FS.
5. Build a `filter_complex` chain: each PNG composited via `overlay` with
   `enable='between(t,{startSec},{endSec})'`, chained in sequence.
6. Run ffmpeg once, read back the output file as a `Blob`, same container/
   codec as the input where possible.
7. Wrap the entire function body in try/catch (including the dynamic
   import) — any failure resolves `null`, never throws to the caller.

### Done screen (`app.ts` `finishSession`, `done-screen.ts`)

- `finishSession()` calls `renderDoneScreen` immediately with the raw
  `videoUrl`, exactly as today, and separately kicks off
  `burnOverlay(...)` without awaiting it before rendering.
- `renderDoneScreen` gains an optional `onBurnInReady?: Promise<Blob |
  null>` (or an injected callback-based equivalent, matching this
  codebase's dependency-injection test style). While pending, a small
  inline status note near the video (e.g. "動画を仕上げています…") is shown;
  the video, download, share, and 工夫 inputs are all fully usable in the
  meantime, since burn-in is purely additive.
- On resolution: if a blob came back, swap `video.src`/`videoUrl` and the
  blob used by `onShare`/download to the burned-in version, and remove the
  status note. If `null` (failure or unsupported), just remove the status
  note — raw video remains final, matching today's output exactly.
- Re-entrant calls to `renderDoneScreen` (e.g. via the parental gate's
  `onCancel` re-render, `setup-screen.ts`-style patterns already used
  here) must not restart burn-in from scratch — the in-flight promise/blob
  is passed through, not recreated.

### Deploy (`_headers`)

New `karate-trainer/public/_headers` (Cloudflare Pages convention, copied
into `dist/` on build since it lives under `public/`):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

Verified: the app has zero cross-origin resource references (fonts,
scripts, images, manifest are all same-origin) — confirmed via grep across
`index.html`, `style.css`, and `src/`. COEP `require-corp` is therefore
safe to enable with no CORP-header changes needed on other resources.

### Dependencies

Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` to the root `package.json`
(shared workspace, per existing convention — karate-trainer has no
separate `package.json`).

## Testing

- `overlay-event-log.test.ts`: `setState()` timestamps relative to
  `start()`, multiple patches accumulate correctly, `getEvents()` returns
  them in order.
- `overlay-frame-render.test.ts`: given a `CompositorState`, produces a
  PNG blob of the expected canvas dimensions (reusing existing jsdom
  canvas mocking patterns from the current `canvas-compositor.test.ts`,
  which this replaces).
- `overlay-burner.test.ts`: inject a mock ffmpeg module (matching the
  `RecorderDeps`-style dependency injection already used in
  `recorder.ts`) to verify: segment collapsing logic from events,
  filter-chain construction, and that any thrown error resolves `null`
  rather than rejecting.
- `app.test.ts` / `done-screen.test.ts` updates: recording no longer
  passes a `streamOverride`; done screen shows raw video immediately and
  swaps in a burned-in blob when a resolved promise is supplied, and
  falls back silently when the promise resolves `null`.
- Manual iPhone verification (per [[karate-browser-verify]] memory): full
  record → done screen → burn-in completes → downloaded video has audio,
  no freeze, and burned-in text, on an actual iPhone over LAN.

## Non-goals

- Native ReplayKit screen recording for the iOS App Store build — separate
  future spec.
- Retry UI for failed burn-in — silent fallback only, per approved design.
- Multi-threaded ffmpeg.wasm performance tuning beyond enabling the
  COOP/COEP headers — if real-world timing is worse than the ~1.5–3 min
  estimate for a 3-minute clip, that is a follow-up investigation, not
  blocking for this spec.
