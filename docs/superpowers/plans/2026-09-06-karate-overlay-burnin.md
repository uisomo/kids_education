# Karate Overlay Burn-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop recording through a live canvas compositor (which freezes/loses audio on iOS Safari), record raw camera+audio directly, and burn overlay text into the saved video afterward via ffmpeg.wasm, with the raw video usable immediately while burn-in runs in the background.

**Architecture:** Replace `CanvasCompositor` (live canvas drawing + `captureStream()`) with `OverlayEventLog` (a timestamped log of the same `setState()` calls, no drawing). `app.ts` records the raw camera stream directly. After `stop()`, `finishSession()` shows the done screen immediately with the raw video, then kicks off an async burn-in pipeline (`overlay-frame-render.ts` renders PNG snapshots of each overlay state via reused pill/text drawing code, `overlay-burner.ts` loads ffmpeg.wasm and composites those PNGs onto the raw video with timed `overlay` filters). The done screen swaps in the burned-in blob when ready, or silently keeps the raw video if burn-in fails.

**Tech Stack:** TypeScript, Vite, Vitest + jsdom, `@ffmpeg/ffmpeg` + `@ffmpeg/util` (new deps), Cloudflare Pages (`_headers` file for COOP/COEP).

**Spec:** `docs/superpowers/specs/2026-09-06-karate-overlay-burnin-design.md`

## Global Constraints

- Burn-in failure of any kind (unsupported browser, ffmpeg error, timeout) must silently fall back to the raw video — never show an error, never block download/share.
- The on-screen DOM overlay (`training-screen.ts`) is untouched — it already renders independently of the recording path.
- PNG overlay rendering must reuse the existing pill-background + text drawing look (rounded rect, `900 {size}px "Hiragino Sans"`, existing per-field colors/positions) — pixel-identical to today's `CanvasCompositor.drawFrame()` output.
- Canvas target size stays 720×1280 (portrait 9:16), matching current `CANVAS_W`/`CANVAS_H`.
- No cross-origin resources exist in this app today (verified via grep) — the new `_headers` file (COOP `same-origin` / COEP `require-corp`) is safe to add with no other header changes needed.
- `@ffmpeg/ffmpeg` must be loaded lazily (dynamic `import()`), only when burn-in actually runs — never adds to initial page load.
- Follow existing dependency-injection conventions: interfaces defined in `app.ts` (`VideoRecorderLike`-style), real implementations wired in `main.ts`, fakes/mocks injected in tests.

---

## File Structure

- **Delete:** `karate-trainer/src/canvas-compositor.ts`, `tests/karate/canvas-compositor.test.ts` — replaced by the two files below.
- **Create:** `karate-trainer/src/overlay-event-log.ts` — timestamped event log, replaces `CanvasCompositor`'s role in `app.ts` (no drawing, no canvas).
- **Create:** `tests/karate/overlay-event-log.test.ts`
- **Create:** `karate-trainer/src/overlay-frame-render.ts` — pure function: `CompositorState` → PNG `Blob`, reusing the pill/text drawing code.
- **Create:** `tests/karate/overlay-frame-render.test.ts`
- **Create:** `karate-trainer/src/overlay-burner.ts` — takes raw video blob + events, returns burned-in blob or `null`.
- **Create:** `tests/karate/overlay-burner.test.ts`
- **Modify:** `karate-trainer/src/app.ts` — drop `CompositorLike`/`makeCompositor`/live-compositing recording branch; add `OverlayEventLog` wiring; kick off burn-in in `finishSession()`; pass a burn-in promise to the done screen.
- **Modify:** `tests/karate/app.test.ts` — update the two tests that reference `makeCompositor`/compositor mocks.
- **Modify:** `karate-trainer/src/ui/done-screen.ts` — accept an optional burn-in promise; show/hide a status note; swap `videoUrl`/share blob on resolution.
- **Modify:** `tests/karate/done-screen.test.ts` — add tests for the burn-in-pending/resolved/failed states.
- **Modify:** `karate-trainer/src/main.ts` — replace `CanvasCompositor` wiring with `OverlayEventLog`; wire the real `overlay-burner.ts` into `finishSession`'s burn-in call (via a new small factory dep, since `main.ts` is the composition root).
- **Create:** `karate-trainer/public/_headers` — Cloudflare Pages COOP/COEP headers.
- **Modify:** root `package.json` — add `@ffmpeg/ffmpeg`, `@ffmpeg/util`.

---

### Task 1: `OverlayEventLog` — timestamped overlay state log

**Files:**
- Create: `karate-trainer/src/overlay-event-log.ts`
- Test: `tests/karate/overlay-event-log.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CompositorState {
    drill: string;
    seconds: number;
    cue: string;
    caption: string;
  }
  export interface OverlayEvent {
    t: number; // ms since start()
    patch: Partial<CompositorState>;
  }
  export interface OverlayEventLogDeps {
    now?: () => number; // default performance.now(); injectable for tests
  }
  export class OverlayEventLog {
    constructor(deps?: OverlayEventLogDeps);
    start(): void;
    setState(patch: Partial<CompositorState>): void;
    getEvents(): OverlayEvent[];
  }
  ```
  Later tasks (`app.ts` wiring, `overlay-frame-render.ts`, `overlay-burner.ts`) consume `CompositorState` and `OverlayEvent` from this file.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/overlay-event-log.test.ts
import { it, expect } from "vitest";
import { OverlayEventLog } from "../../karate-trainer/src/overlay-event-log";

it("timestamps setState calls relative to start()", () => {
  let t = 1000;
  const log = new OverlayEventLog({ now: () => t });
  log.start();
  t = 1500;
  log.setState({ drill: "前蹴り" });
  t = 2200;
  log.setState({ seconds: 5 });
  expect(log.getEvents()).toEqual([
    { t: 500, patch: { drill: "前蹴り" } },
    { t: 1200, patch: { seconds: 5 } },
  ]);
});

it("returns an empty array when nothing was logged", () => {
  const log = new OverlayEventLog({ now: () => 0 });
  log.start();
  expect(log.getEvents()).toEqual([]);
});

it("defaults to performance.now() when no now() is injected", () => {
  const log = new OverlayEventLog();
  log.start();
  log.setState({ cue: "ファイト！" });
  const events = log.getEvents();
  expect(events).toHaveLength(1);
  expect(events[0].t).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/overlay-event-log.test.ts`
Expected: FAIL — `Cannot find module '../../karate-trainer/src/overlay-event-log'`

- [ ] **Step 3: Write minimal implementation**

```ts
// karate-trainer/src/overlay-event-log.ts
// Logs timestamped overlay state changes (drill/seconds/cue/caption) during a
// training session, for later offline burn-in — replaces CanvasCompositor's
// role in app.ts, but does no drawing and holds no canvas.

export interface CompositorState {
  drill: string;      // 種目名
  seconds: number;     // countdown; <=0 hides it
  cue: string;         // 掛け声; "" hides it
  caption: string;     // 工夫メモ; "" hides it
}

export interface OverlayEvent {
  t: number; // ms since start()
  patch: Partial<CompositorState>;
}

export interface OverlayEventLogDeps {
  now?: () => number;
}

export class OverlayEventLog {
  private now: () => number;
  private startTime = 0;
  private events: OverlayEvent[] = [];

  constructor(deps: OverlayEventLogDeps = {}) {
    this.now = deps.now ?? (() => performance.now());
  }

  start(): void {
    this.startTime = this.now();
    this.events = [];
  }

  setState(patch: Partial<CompositorState>): void {
    this.events.push({ t: this.now() - this.startTime, patch });
  }

  getEvents(): OverlayEvent[] {
    return this.events;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/overlay-event-log.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/overlay-event-log.ts tests/karate/overlay-event-log.test.ts
git commit -m "feat(karate): add OverlayEventLog to replace live canvas compositing"
```

---

### Task 2: `overlay-frame-render.ts` — render one overlay state to a PNG

**Files:**
- Create: `karate-trainer/src/overlay-frame-render.ts`
- Test: `tests/karate/overlay-frame-render.test.ts`

**Interfaces:**
- Consumes: `CompositorState` from `overlay-event-log.ts` (Task 1).
- Produces:
  ```ts
  export interface FrameRenderDeps {
    canvas?: HTMLCanvasElement; // injectable for tests; default creates a detached <canvas>
  }
  export function renderOverlayFrame(
    state: CompositorState,
    deps?: FrameRenderDeps,
  ): Promise<Blob>; // transparent PNG, 720x1280
  ```
  Consumed by `overlay-burner.ts` (Task 3) to produce one PNG per distinct overlay segment.

This reuses the drawing logic from the old `CanvasCompositor.drawLabel`/`roundRect`/the four `if (...)` blocks in `drawFrame()` (top band, countdown, cue, caption) — but skips `drawVideoCover` entirely, since this renders overlay-only PNGs (transparent background) for compositing onto the already-recorded raw video, not a full frame.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/overlay-frame-render.test.ts
// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { renderOverlayFrame } from "../../karate-trainer/src/overlay-frame-render";

function fakeCtx() {
  return {
    texts: [] as string[],
    font: "", textAlign: "", textBaseline: "", fillStyle: "",
    clearRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    fillText(this: { texts: string[] }, t: string) { this.texts.push(t); },
  };
}

function fakeCanvas(ctx: unknown, blob: Blob): HTMLCanvasElement {
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  } as unknown as HTMLCanvasElement;
}

it("draws drill/countdown/cue/caption text and resolves a PNG blob", async () => {
  const ctx = fakeCtx();
  const pngBlob = new Blob(["png"], { type: "image/png" });
  const canvas = fakeCanvas(ctx, pngBlob);

  const result = await renderOverlayFrame(
    { drill: "前蹴り", seconds: 12, cue: "ファイト！", caption: "腰を落とす" },
    { canvas },
  );

  expect(ctx.texts).toContain("前蹴り");
  expect(ctx.texts).toContain("12");
  expect(ctx.texts).toContain("ファイト！");
  expect(ctx.texts).toContain("腰を落とす");
  expect(result).toBe(pngBlob);
});

it("omits countdown/cue/caption text when empty", async () => {
  const ctx = fakeCtx();
  const canvas = fakeCanvas(ctx, new Blob(["png"]));

  await renderOverlayFrame({ drill: "回し蹴り", seconds: 0, cue: "", caption: "" }, { canvas });

  expect(ctx.texts).toEqual(["回し蹴り"]);
});

it("rejects when the canvas has no 2D context", async () => {
  const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
  await expect(renderOverlayFrame({ drill: "型", seconds: 0, cue: "", caption: "" }, { canvas }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/overlay-frame-render.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// karate-trainer/src/overlay-frame-render.ts
// Renders a single overlay state (種目名/countdown/掛け声/工夫メモ) as a
// transparent PNG, for later compositing onto the raw recorded video via
// ffmpeg.wasm. Reuses the same pill-background + text look as the old live
// CanvasCompositor, but draws no camera frame — overlay only.
import type { CompositorState } from "./overlay-event-log";

const CANVAS_W = 720;
const CANVAS_H = 1280;

export interface FrameRenderDeps {
  canvas?: HTMLCanvasElement;
}

export function renderOverlayFrame(
  state: CompositorState,
  deps: FrameRenderDeps = {},
): Promise<Blob> {
  const canvas = deps.canvas ?? document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D context unavailable"));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { drill, seconds, cue, caption } = state;
  if (drill) drawLabel(ctx, drill, CANVAS_W / 2, 90, 44, "#ffffff", "rgba(0,0,0,0.6)");
  if (seconds > 0) drawLabel(ctx, String(seconds), CANVAS_W / 2, 230, 150, "#ffd166", "rgba(0,0,0,0.55)");
  if (cue) drawLabel(ctx, cue, CANVAS_W / 2, CANVAS_H / 2, 72, "#ffd166", "rgba(214,48,49,0.85)");
  if (caption) drawLabel(ctx, caption, CANVAS_W / 2, CANVAS_H - 90, 34, "#1a162b", "rgba(255,209,102,0.92)");

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fontPx: number,
  color: string,
  bg: string,
): void {
  ctx.font = `900 ${fontPx}px "Hiragino Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const padX = fontPx * 0.5;
  const padY = fontPx * 0.35;
  const boxW = metrics.width + padX * 2;
  const boxH = fontPx + padY * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, fontPx * 0.3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/overlay-frame-render.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/overlay-frame-render.ts tests/karate/overlay-frame-render.test.ts
git commit -m "feat(karate): render overlay states as standalone PNG frames"
```

---

### Task 3: `overlay-burner.ts` — ffmpeg.wasm burn-in pipeline

**Files:**
- Create: `karate-trainer/src/overlay-burner.ts`
- Test: `tests/karate/overlay-burner.test.ts`
- Modify: root `package.json` (add `@ffmpeg/ffmpeg`, `@ffmpeg/util`)

**Interfaces:**
- Consumes: `OverlayEvent`, `CompositorState` (Task 1); `renderOverlayFrame` (Task 2).
- Produces:
  ```ts
  export interface FfmpegLike {
    load(opts: { coreURL: string; wasmURL: string }): Promise<void>;
    writeFile(name: string, data: Uint8Array): Promise<void>;
    exec(args: string[]): Promise<void>;
    readFile(name: string): Promise<Uint8Array>;
  }
  export interface OverlayBurnerDeps {
    // Injectable for tests; default dynamically imports @ffmpeg/ffmpeg and
    // @ffmpeg/util and constructs a real FFmpeg instance.
    makeFfmpeg?: () => Promise<FfmpegLike>;
    renderFrame?: typeof renderOverlayFrame;
  }
  export async function burnOverlay(
    rawVideoBlob: Blob,
    events: OverlayEvent[],
    totalDurationMs: number,
    ext: string, // "mp4" | "webm" — matches VideoRecorder.fileExtension()
    deps?: OverlayBurnerDeps,
  ): Promise<Blob | null>; // null on any failure — caller falls back to raw
  ```
  Consumed by `app.ts` (Task 4) in `finishSession()`, wired to the real ffmpeg loader in `main.ts` (Task 6).

**Step-by-step:**

- [ ] **Step 1: Install dependencies**

```bash
cd /mnt/c/Projects/kids_education && npm install @ffmpeg/ffmpeg @ffmpeg/util
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/karate/overlay-burner.test.ts
import { it, expect, vi } from "vitest";
import { burnOverlay } from "../../karate-trainer/src/overlay-burner";
import type { OverlayEvent } from "../../karate-trainer/src/overlay-event-log";

function fakeFfmpeg() {
  const written: Record<string, Uint8Array> = {};
  const execCalls: string[][] = [];
  return {
    ffmpeg: {
      load: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn(async (name: string, data: Uint8Array) => { written[name] = data; }),
      exec: vi.fn(async (args: string[]) => { execCalls.push(args); }),
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
    written,
    execCalls,
  };
}

const renderFrame = vi.fn(async () => new Blob(["png"], { type: "image/png" }));

it("collapses events into segments, renders one PNG per segment, and runs ffmpeg once", async () => {
  const { ffmpeg, written, execCalls } = fakeFfmpeg();
  const events: OverlayEvent[] = [
    { t: 0, patch: { drill: "前蹴り", seconds: 0, cue: "", caption: "" } },
    { t: 1000, patch: { seconds: 3 } },
    { t: 2000, patch: { cue: "ファイト！" } },
  ];

  const result = await burnOverlay(
    new Blob(["raw"], { type: "video/mp4" }),
    events,
    3000,
    "mp4",
    { makeFfmpeg: async () => ffmpeg, renderFrame },
  );

  expect(renderFrame).toHaveBeenCalledTimes(3);
  expect(ffmpeg.load).toHaveBeenCalledOnce();
  expect(Object.keys(written)).toContain("input.mp4");
  expect(execCalls).toHaveLength(1);
  const args = execCalls[0].join(" ");
  expect(args).toContain("overlay");
  expect(args).toContain("enable='between(t,0,1)'");
  expect(args).toContain("enable='between(t,1,2)'");
  expect(args).toContain("enable='between(t,2,3)'");
  expect(result).toBeInstanceOf(Blob);
});

it("returns null when ffmpeg fails to load", async () => {
  const result = await burnOverlay(
    new Blob(["raw"]),
    [{ t: 0, patch: { drill: "型", seconds: 0, cue: "", caption: "" } }],
    1000,
    "mp4",
    { makeFfmpeg: async () => { throw new Error("wasm unsupported"); }, renderFrame },
  );
  expect(result).toBeNull();
});

it("returns null when ffmpeg.exec throws", async () => {
  const { ffmpeg } = fakeFfmpeg();
  ffmpeg.exec = vi.fn().mockRejectedValue(new Error("oom"));
  const result = await burnOverlay(
    new Blob(["raw"]),
    [{ t: 0, patch: { drill: "型", seconds: 0, cue: "", caption: "" } }],
    1000,
    "mp4",
    { makeFfmpeg: async () => ffmpeg, renderFrame },
  );
  expect(result).toBeNull();
});

it("returns null with an empty event log rather than calling ffmpeg", async () => {
  const { ffmpeg } = fakeFfmpeg();
  const result = await burnOverlay(new Blob(["raw"]), [], 1000, "mp4", {
    makeFfmpeg: async () => ffmpeg, renderFrame,
  });
  expect(result).toBeNull();
  expect(ffmpeg.load).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/karate/overlay-burner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write minimal implementation**

```ts
// karate-trainer/src/overlay-burner.ts
// Offline overlay burn-in: given the raw camera+audio recording and the
// timestamped overlay event log, renders one transparent PNG per distinct
// overlay state and composites them onto the video with ffmpeg.wasm, each
// enabled only for its own time window. Runs entirely client-side, after
// recording has already stopped — decoupled from the live MediaRecorder
// path so it can never cause the freeze/silence bugs that live canvas
// compositing did on iOS Safari.
import type { OverlayEvent, CompositorState } from "./overlay-event-log";
import { renderOverlayFrame } from "./overlay-frame-render";

export interface FfmpegLike {
  load(opts: { coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  exec(args: string[]): Promise<void>;
  readFile(name: string): Promise<Uint8Array>;
}

export interface OverlayBurnerDeps {
  makeFfmpeg?: () => Promise<FfmpegLike>;
  renderFrame?: typeof renderOverlayFrame;
}

interface Segment {
  state: CompositorState;
  startMs: number;
  endMs: number;
}

const EMPTY_STATE: CompositorState = { drill: "", seconds: 0, cue: "", caption: "" };

function toSegments(events: OverlayEvent[], totalDurationMs: number): Segment[] {
  if (events.length === 0) return [];
  const segments: Segment[] = [];
  let state: CompositorState = { ...EMPTY_STATE };
  for (let i = 0; i < events.length; i++) {
    state = { ...state, ...events[i].patch };
    const startMs = events[i].t;
    const endMs = i + 1 < events.length ? events[i + 1].t : totalDurationMs;
    if (endMs > startMs) segments.push({ state, startMs, endMs });
  }
  return segments;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function defaultMakeFfmpeg(): Promise<FfmpegLike> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ffmpeg as unknown as FfmpegLike;
}

export async function burnOverlay(
  rawVideoBlob: Blob,
  events: OverlayEvent[],
  totalDurationMs: number,
  ext: string,
  deps: OverlayBurnerDeps = {},
): Promise<Blob | null> {
  const segments = toSegments(events, totalDurationMs);
  if (segments.length === 0) return null;

  const renderFrame = deps.renderFrame ?? renderOverlayFrame;
  const makeFfmpeg = deps.makeFfmpeg ?? defaultMakeFfmpeg;

  try {
    const ffmpeg = await makeFfmpeg();
    const inputName = `input.${ext}`;
    await ffmpeg.writeFile(inputName, await blobToUint8Array(rawVideoBlob));

    const pngNames: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const png = await renderFrame(segments[i].state);
      const name = `overlay-${i}.png`;
      await ffmpeg.writeFile(name, await blobToUint8Array(png));
      pngNames.push(name);
    }

    const filterParts: string[] = [];
    let lastLabel = "0:v";
    segments.forEach((seg, i) => {
      const outLabel = i === segments.length - 1 ? "vout" : `v${i}`;
      const startSec = seg.startMs / 1000;
      const endSec = seg.endMs / 1000;
      filterParts.push(
        `[${lastLabel}][${i + 1}:v]overlay=enable='between(t,${startSec},${endSec})'[${outLabel}]`,
      );
      lastLabel = outLabel;
    });

    const outputName = `output.${ext}`;
    const args = [
      "-i", inputName,
      ...pngNames.flatMap((n) => ["-i", n]),
      "-filter_complex", filterParts.join(";"),
      "-map", "[vout]",
      "-map", "0:a?",
      "-c:a", "copy",
      outputName,
    ];
    await ffmpeg.exec(args);

    const outBytes = await ffmpeg.readFile(outputName);
    return new Blob([outBytes], { type: rawVideoBlob.type || `video/${ext}` });
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/karate/overlay-burner.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json karate-trainer/src/overlay-burner.ts tests/karate/overlay-burner.test.ts
git commit -m "feat(karate): burn overlay PNGs onto raw recording via ffmpeg.wasm"
```

---

### Task 4: Wire `OverlayEventLog` + raw recording into `app.ts`; delete `CanvasCompositor`

**Files:**
- Modify: `karate-trainer/src/app.ts`
- Modify: `tests/karate/app.test.ts`
- Delete: `karate-trainer/src/canvas-compositor.ts`
- Delete: `tests/karate/canvas-compositor.test.ts`

**Interfaces:**
- Consumes: `OverlayEventLog`, `CompositorState`, `OverlayEvent` from `overlay-event-log.ts` (Task 1); `burnOverlay` signature from `overlay-burner.ts` (Task 3, wired as an injected dep).
- Produces: `KarateAppDeps.burnOverlay?(rawVideoBlob: Blob, events: OverlayEvent[], totalDurationMs: number, ext: string): Promise<Blob | null>` — consumed by `main.ts` (Task 6) to inject the real `overlay-burner.ts`, and by `done-screen.ts` (Task 5) indirectly via the promise `finishSession()` passes down.

**Step-by-step:**

- [ ] **Step 1: Update the two `app.test.ts` tests that reference `makeCompositor`**

Replace the `makeCompositor`-based mock in both `"records the composited stream and feeds drill/countdown state to the compositor"` and `"uses the parent's ファイト comment as the practice cue and burns it in"` (lines 254 and 322 of `tests/karate/app.test.ts`) with an `OverlayEventLog`-based assertion. Full replacement for the first test:

```ts
it("records the raw camera stream directly and logs drill/countdown state for later burn-in", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const startRecording = vi.fn();

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording,
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));   // camera
  await new Promise((r) => setTimeout(r, 0));   // intro

  // No streamOverride — records the raw camera stream directly.
  expect(startRecording).toHaveBeenCalledWith();

  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // Session completed without error; done screen is showing.
  expect(root.querySelector("[data-download]")).not.toBeNull();
});
```

Full replacement for the second test (the ファイト comment test) — same structure, but assert on the on-screen cue only (the compositor/burn-in path no longer observes cues directly in this test; burn-in event logging is covered by Task 1/3's own tests):

```ts
it("uses the parent's ファイト comment as the practice cue", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  saveComment("fight", "まけるな たろう", scopedStorage(storage, getActiveId(storage)));

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 20, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  for (let t = 0; t < 10000; t += 250) loopCb!(250);

  expect(root.querySelector<HTMLElement>("[data-cue]")!.textContent).toBe("まけるな たろう");
});
```

Note: `memStorage` is already defined later in the same file (line 309 in the pre-change version) — since it's used by the first occurrence at line 322 already, no new helper is needed, but confirm its declaration appears before first use after the edit (hoisted `function` declarations are fine either way in this file).

- [ ] **Step 2: Run the updated tests to verify they fail against current `app.ts`**

Run: `npx vitest run tests/karate/app.test.ts`
Expected: FAIL — `startRecording` still receives a composited stream argument (or `makeCompositor`-shaped calls no longer exist), confirming the test now exercises the target behavior.

- [ ] **Step 3: Update `app.ts`**

In `karate-trainer/src/app.ts`:

Replace the `CompositorLike` interface and `makeCompositor` field (lines 38-45, 86-90) with:

```ts
import { OverlayEventLog, type OverlayEvent } from "./overlay-event-log";
```

(add near the other imports, e.g. after the `character-store` import block)

Remove the `CompositorLike` interface entirely. In `KarateAppDeps`, replace:

```ts
  // Optional canvas compositor factory: builds a compositor bound to the given
  // camera <video>, used to burn 種目名/countdown/cue/工夫 into the recording.
  // When omitted (or captureStream unsupported), recording falls back to the
  // raw camera feed with no burned-in text.
  makeCompositor?(video: HTMLVideoElement): CompositorLike;
```

with:

```ts
  // Burns overlay text (種目名/countdown/cue/工夫) into the saved recording as
  // an offline post-process, after the raw camera+audio recording has already
  // stopped. Returns null on any failure (unsupported browser, ffmpeg error)
  // — the caller falls back to the raw video with no burned-in text.
  burnOverlay?(
    rawVideoBlob: Blob,
    events: OverlayEvent[],
    totalDurationMs: number,
    ext: string,
  ): Promise<Blob | null>;
```

Replace the `private compositor: CompositorLike | null = null;` field with:

```ts
  private overlayLog: OverlayEventLog | null = null;
```

In `beginTraining()`, replace the compositor-building block:

```ts
    this.compositor = this.deps.makeCompositor?.(view.videoEl) ?? null;
    if (this.compositor) {
      this.compositor.start();
      recorder.startRecording(this.compositor.captureStream(stream));
    } else {
      recorder.startRecording();
    }
```

with:

```ts
    // Record the raw camera+audio stream directly — no live canvas
    // compositing, so none of the iOS Safari canvas.captureStream()
    // freeze/silent-audio bugs can occur. Overlay text is logged with
    // timestamps here and burned into the file afterward (finishSession()).
    this.overlayLog = new OverlayEventLog();
    this.overlayLog.start();
    recorder.startRecording();
```

Replace every remaining `this.compositor?.setState({...})` call (in the `onDrillStart`, `onTick`, and `onEncourage` handlers) with `this.overlayLog?.setState({...})` — same patch shapes, no other changes.

In `finishSession()`, replace:

```ts
    this.compositor?.stop();
    this.compositor = null;

    const recorder = this.videoRecorder;
    const blob = recorder ? await recorder.stop() : new Blob();
    await this.deps.wakeGuard.release();

    const ext = recorder ? recorder.fileExtension() : "webm";
    const videoUrl = URL.createObjectURL(blob);
```

with:

```ts
    const events = this.overlayLog?.getEvents() ?? [];
    this.overlayLog = null;

    const recorder = this.videoRecorder;
    const blob = recorder ? await recorder.stop() : new Blob();
    await this.deps.wakeGuard.release();

    const ext = recorder ? recorder.fileExtension() : "webm";
    const videoUrl = URL.createObjectURL(blob);
    const elapsedSecondsForBurn = Math.floor(this.recElapsedMs);
    const burnInPromise = this.deps.burnOverlay
      ? this.deps.burnOverlay(blob, events, elapsedSecondsForBurn, ext)
      : Promise.resolve(null);
```

Then in the `renderDoneScreen(...)` call within `finishSession()`, add:

```ts
      burnInPromise,
```

as a new property alongside the existing `videoUrl, ext, stats, ...` fields (Task 5 adds this field to `DoneDeps`).

- [ ] **Step 4: Delete `canvas-compositor.ts` and its test**

```bash
rm karate-trainer/src/canvas-compositor.ts tests/karate/canvas-compositor.test.ts
```

- [ ] **Step 5: Run the full karate test suite**

Run: `npx vitest run tests/karate/`
Expected: `app.test.ts` passes; failures are expected only in `done-screen.test.ts` if Task 5 hasn't landed yet in the same working tree — if running Task 4 in isolation, temporarily stub `burnInPromise` as an unused prop (TypeScript allows extra object properties only if `DoneDeps` doesn't use `exactOptionalPropertyTypes`; if the build errors, complete Task 5 first before this step, since `DoneDeps` must accept the new field for `app.ts` to type-check).

- [ ] **Step 6: Commit**

```bash
git add karate-trainer/src/app.ts tests/karate/app.test.ts
git rm karate-trainer/src/canvas-compositor.ts tests/karate/canvas-compositor.test.ts
git commit -m "refactor(karate): record raw camera+audio directly, log overlay events for offline burn-in"
```

---

### Task 5: `done-screen.ts` — show raw video immediately, swap in burned-in version when ready

**Files:**
- Modify: `karate-trainer/src/ui/done-screen.ts`
- Modify: `tests/karate/done-screen.test.ts`

**Interfaces:**
- Consumes: `burnInPromise?: Promise<Blob | null>` passed from `app.ts` (Task 4).
- Produces: no new exports; `DoneDeps` gains one new optional field, consumed only by `app.ts`.

**Step-by-step:**

- [ ] **Step 1: Write the failing tests**

Add to `tests/karate/done-screen.test.ts`:

```ts
it("shows a status note while burn-in is pending, then swaps in the burned-in video", async () => {
  const root = document.createElement("div");
  let resolveBurnIn!: (b: Blob | null) => void;
  const burnInPromise = new Promise<Blob | null>((r) => { resolveBurnIn = r; });

  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:burned");

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    burnInPromise,
  });

  // Raw video is immediately playable.
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:raw");
  expect(root.querySelector("[data-burnin-status]")).not.toBeNull();

  resolveBurnIn(new Blob(["burned"], { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:burned");
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});

it("keeps the raw video and hides the status note when burn-in resolves null", async () => {
  const root = document.createElement("div");
  const burnInPromise = Promise.resolve(null);

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    burnInPromise,
  });

  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:raw");
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});

it("the share button uses the burned-in blob once ready", async () => {
  const root = document.createElement("div");
  const burnedBlob = new Blob(["burned"], { type: "video/mp4" });
  const onShare = vi.fn();

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    burnInPromise: Promise.resolve(burnedBlob),
  });

  await new Promise((r) => setTimeout(r, 0));

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  expect(onShare).toHaveBeenCalledWith(burnedBlob);
});

it("omits the status note entirely when no burnInPromise is given", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});
```

Note: this changes `onShare`'s signature from `(): void` to `(blob?: Blob): void` — see Step 3 for the exact contract (falls back to the original `videoUrl`'s blob when burn-in never resolves/is absent, via the blob already threaded through from `app.ts`'s `finishSession` closure, matching the existing `blobForShare` pattern at `app.ts:552`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: FAIL — `data-burnin-status` never rendered; `onShare` called with no arguments.

- [ ] **Step 3: Update `done-screen.ts`**

In `karate-trainer/src/ui/done-screen.ts`, update `DoneDeps`:

```ts
export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(blob?: Blob): void;
  onAgain(): void;
  gateChallenge?: GateChallenge;
  characterId?: CharacterId;
  xpEarned?: number;
  kufuDrills?: DoneKufuDrill[];
  onSaveKufu?(drillName: string, text: string): void;
  kufuEnabled?: boolean;
  // Resolves to the burned-in video blob, or null if burn-in failed/was
  // skipped — in which case the raw videoUrl remains the final result.
  burnInPromise?: Promise<Blob | null>;
}
```

After the `video` element is created (right after the existing `video.controls = true;` line), add:

```ts
  let shareBlob: Blob | undefined;

  const burninStatus = document.createElement("div");
  burninStatus.dataset.burninStatus = "";
  burninStatus.className = "burnin-status";
  burninStatus.textContent = "動画を仕上げています…";
  const showBurninStatus = !!deps.burnInPromise;

  if (deps.burnInPromise) {
    void deps.burnInPromise.then((burnedBlob) => {
      burninStatus.remove();
      if (burnedBlob) {
        shareBlob = burnedBlob;
        video.setAttribute("src", URL.createObjectURL(burnedBlob));
      }
    });
  }
```

`burninStatus` is not appended to `root` here — it is only inserted via the final `root.append(...)` call at the bottom of the function (see below), guarded by `showBurninStatus`. Calling `.remove()` on resolution is safe even before it's been inserted (a detached element's `.remove()` is a no-op), so ordering between promise resolution and the final append is not a race.

Update the download button's click handler:

```ts
  dl.addEventListener("click", () => {
    renderParentalGate(root, {
      challenge: deps.gateChallenge,
      onPass: () => deps.onShare(shareBlob),
      onCancel: () => renderDoneScreen(root, deps),
    });
  });
```

Update the final `root.append(...)` call to conditionally include the status note:

```ts
  root.append(celebCard, video, stats, kufuSection, dl, again);
  if (showBurninStatus) root.insertBefore(burninStatus, dl);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: PASS (all tests, including the 5 new ones plus the pre-existing ones — note the pre-existing tests that call `onShare` with no burn-in still pass since `shareBlob` is `undefined` in that case, matching `onShare(): void`'s original call sites via optional param)

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/done-screen.ts tests/karate/done-screen.test.ts
git commit -m "feat(karate): show raw video immediately, swap in burned-in version when ready"
```

---

### Task 6: Wire real `overlay-burner.ts` into `main.ts`; add `_headers` for COOP/COEP

**Files:**
- Modify: `karate-trainer/src/main.ts`
- Modify: `karate-trainer/src/app.ts` (only `finishSession`'s `onShare` closure — see Step 2)
- Create: `karate-trainer/public/_headers`

**Interfaces:**
- Consumes: `burnOverlay` from `overlay-burner.ts` (Task 3); `KarateAppDeps.burnOverlay` from `app.ts` (Task 4).
- Produces: none (composition root — nothing downstream depends on `main.ts`).

**Step-by-step:**

- [ ] **Step 1: Update `main.ts`**

In `karate-trainer/src/main.ts`, remove:

```ts
import { CanvasCompositor } from "./canvas-compositor";
```

Add:

```ts
import { burnOverlay } from "./overlay-burner";
```

Replace the `makeCompositor` field in the `KarateApp` constructor call:

```ts
  // Burn overlays into the recording when the browser supports canvas capture;
  // otherwise omit so recording falls back to the raw camera feed.
  makeCompositor: CanvasCompositor.isSupported()
    ? (video) => new CanvasCompositor(video)
    : undefined,
```

with:

```ts
  // Burns overlay text into the saved recording as an offline post-process
  // via ffmpeg.wasm, after the raw camera+audio recording has stopped.
  // Falls back to the raw (un-burned) video on any failure — see
  // overlay-burner.ts.
  burnOverlay: (rawVideoBlob, events, totalDurationMs, ext) =>
    burnOverlay(rawVideoBlob, events, totalDurationMs, ext),
```

- [ ] **Step 2: Confirm `finishSession()`'s `onShare` closure passes through the blob it's given**

In `karate-trainer/src/app.ts`, `finishSession()` currently has (per Task 4's edits):

```ts
      onShare: () => {
        void this.deps.shareRecording(blobForShare, ext).catch((e) => {
          console.error("shareRecording failed", e);
        });
      },
```

Update it to accept the optional burned-in blob from `done-screen.ts` and prefer it over the raw `blobForShare`:

```ts
      onShare: (burnedBlob) => {
        void this.deps.shareRecording(burnedBlob ?? blobForShare, ext).catch((e) => {
          console.error("shareRecording failed", e);
        });
      },
```

- [ ] **Step 3: Create the Cloudflare Pages headers file**

```
# karate-trainer/public/_headers
# Cross-origin isolation, required for ffmpeg.wasm's multi-threaded core
# (SharedArrayBuffer). Safe app-wide: this app has zero cross-origin
# resource references (fonts/scripts/images/manifest are all same-origin).
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

- [ ] **Step 4: Build and confirm `_headers` lands in `dist/`**

Run: `cd /mnt/c/Projects/kids_education && npm run build:karate`
Expected: build succeeds; `ls karate-trainer/dist/_headers` shows the file exists (Vite copies everything under `public/` to the output root).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including `tests/karate/app.test.ts` and `tests/karate/done-screen.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add karate-trainer/src/main.ts karate-trainer/src/app.ts karate-trainer/public/_headers
git commit -m "feat(karate): wire ffmpeg.wasm overlay burn-in into the app; enable cross-origin isolation"
```

---

### Task 7: Manual iPhone verification

**Files:** none (manual verification only)

- [ ] **Step 1: Build and deploy to Cloudflare Pages**

Run:
```bash
cd /mnt/c/Projects/kids_education
npm run build:karate
find karate-trainer/dist -type f -size +25M   # confirm nothing exceeds Cloudflare's 25MB/file limit
npx wrangler pages deploy karate-trainer/dist --project-name=karate-trainer --branch=main --commit-dirty=true
```

- [ ] **Step 2: Verify cross-origin isolation is active**

On a desktop browser, open the deployed URL's DevTools console and run `crossOriginIsolated` — expect `true`. This confirms the `_headers` file is being served correctly by Cloudflare Pages (multi-threaded ffmpeg.wasm requires this).

- [ ] **Step 3: Record a real session on an iPhone**

Using the deployed URL on an actual iPhone (per the `karate-browser-verify` memory's screenshot/interaction recipe): start a session with at least 2-3 drills totaling 30+ seconds, let it run past the point where the old bug froze (~20s), and complete the session.

Expected:
- Recording never visibly freezes on the on-screen camera preview during practice (this was already fine — the bug is in the saved file — but confirm no regression).
- The done screen shows the raw video immediately (no wait to see *something* playable).
- A "動画を仕上げています…" status note appears and later disappears.
- After the status note disappears, replay the video in the done screen: it should have audio throughout, no freeze at any point, and the burned-in drill name/countdown/cue/工夫 text visible.
- Download the video (parental gate → save) and re-open the downloaded file from the Photos app / Files app: confirm audio + no freeze + burned-in text are all present in the actually-saved file, not just the in-page preview.

- [ ] **Step 4: Verify the silent-fallback path**

If burn-in fails for any reason during the above (e.g., ffmpeg.wasm times out or throws on that specific iPhone/iOS version), confirm the fallback behavior: the status note should disappear, the raw video remains playable/downloadable, and no error is shown to the user. If this path triggers, note the iOS version for follow-up investigation, but it is not a blocking failure for this plan — silent fallback to the already-fixed raw recording is the designed behavior.

- [ ] **Step 5: Report results**

No commit for this task — report pass/fail for each expectation in Step 3 back before considering the plan complete.

---

## Self-Review Notes

- **Spec coverage:** raw recording (Task 4) ✓, event logging (Task 1) ✓, PNG rendering reusing existing look (Task 2) ✓, ffmpeg burn-in with overlay filter timing (Task 3) ✓, done-screen instant-preview + swap + silent-fallback UX (Task 5) ✓, COOP/COEP headers (Task 6) ✓, manual iPhone verification (Task 7) ✓. `canvas-compositor.ts` deletion is explicit (Task 4).
- **Placeholder scan:** no TBD/TODO; all code blocks are complete, runnable snippets with exact file paths.
- **Type consistency:** `CompositorState`/`OverlayEvent` defined once in `overlay-event-log.ts` (Task 1) and imported by name in every later task; `burnOverlay`'s signature is identical across `overlay-burner.ts` (Task 3), `app.ts`'s `KarateAppDeps.burnOverlay` (Task 4), and `main.ts`'s wiring (Task 6); `DoneDeps.burnInPromise`/`onShare(blob?: Blob)` in `done-screen.ts` (Task 5) matches the promise `app.ts` passes and the blob `app.ts`'s `onShare` closure now accepts (Task 6, Step 2).
