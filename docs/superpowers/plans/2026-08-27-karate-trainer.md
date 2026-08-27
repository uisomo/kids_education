# Karate Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone iPhone-Safari browser app that runs a timed karate menu, plays the user's own recorded voice cues, and records front-camera video for review.

**Architecture:** Plain TypeScript ES modules served by Vite (no framework). Pure logic units (menu store, scheduler, cue selection) are dependency-injected and unit-tested with Vitest under `tests/karate/`; browser-only units (recorder, voice store, wake-lock) are thin wrappers behind interfaces so the tested logic never touches `getUserMedia`/DOM directly. A single `main.ts` wires the units to the three screens.

**Tech Stack:** TypeScript (ES2022), Vite (dev server + build), Vitest + jsdom (matching the Talk Quest repo). Browser APIs: `getUserMedia`, `MediaRecorder`, IndexedDB, Web Speech (`SpeechSynthesis`) + WebAudio beep for fallback, Screen Wake Lock.

**Spec:** `docs/superpowers/specs/2026-08-27-karate-trainer-design.md`

## Global Constraints

- **Platform:** iPhone Safari, **portrait** only. Target that first; desktop Chrome is a dev convenience, not a supported target.
- **No backend, no framework, no new runtime deps.** Reuse the repo's existing devDeps (`vite`, `vitest`, `typescript`, `jsdom`). App code lives under `karate-trainer/`; tests under `tests/karate/`.
- **iOS rules that are non-negotiable in code:**
  - Camera + mic capture start only inside a **user-gesture** handler.
  - `<video>` preview MUST have `playsinline` and `muted` set or it won't autoplay.
  - `MediaRecorder` output is **`.mp4`** on iOS — never hardcode `webm`; pick the mime type via `MediaRecorder.isTypeSupported`.
  - Preview is **mirrored** (CSS `transform: scaleX(-1)`); the **recorded stream is NOT mirrored**.
- **Storage:** menu → `localStorage`; voice clips (audio blobs) → **IndexedDB**. Voice clips live only in this browser; provide Export/Import.
- **Cues:** if a role has no recorded clips, fall back to WebAudio beep (countdown) / Web Speech TTS (announce, encouragement). Recorded clips take precedence automatically.
- **Language/copy:** UI labels in Japanese as shown in the spec/mockup (e.g. `稽古 開始`, `声を録音`, `動画を保存`). Keep them verbatim.

---

### Task 1: Project scaffold (Vite app + build wiring)

**Files:**
- Create: `karate-trainer/index.html`
- Create: `karate-trainer/vite.config.ts`
- Create: `karate-trainer/src/main.ts` (temporary stub)
- Create: `karate-trainer/style.css` (empty for now)
- Modify: `package.json` (add scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run dev:karate` serves `karate-trainer/` on a fixed port; `npm run build:karate` outputs static files. No exported symbols yet.

- [ ] **Step 1: Create the Vite config**

```ts
// karate-trainer/vite.config.ts
import { defineConfig } from "vite";
export default defineConfig({
  root: "karate-trainer",
  // strictPort so a stale instance can't silently move ports (Talk Quest convention).
  server: { port: 5273, strictPort: true, host: true }, // host:true → reachable from iPhone on LAN
  build: { outDir: "dist", emptyOutDir: true },
});
```

- [ ] **Step 2: Create the HTML shell**

```html
<!-- karate-trainer/index.html -->
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <title>空手稽古</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create the stub entry**

```ts
// karate-trainer/src/main.ts
document.querySelector("#app")!.textContent = "空手稽古 — booting";
```

- [ ] **Step 4: Add scripts to package.json**

Add to the `"scripts"` block:

```json
"dev:karate": "vite --config karate-trainer/vite.config.ts",
"build:karate": "vite build --config karate-trainer/vite.config.ts"
```

- [ ] **Step 5: Verify dev server boots**

Run: `npm run dev:karate`
Expected: Vite starts on port 5273, page shows "空手稽古 — booting". Stop with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add karate-trainer package.json
git commit -m "feat(karate): scaffold standalone Vite app"
```

---

### Task 2: Types + menu store (localStorage, defaults, totals)

**Files:**
- Create: `karate-trainer/src/types.ts`
- Create: `karate-trainer/src/menu-store.ts`
- Test: `tests/karate/menu-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `interface Drill { id: string; name: string; seconds: number; kind: "drill" | "rest" }` and `type Menu = Drill[]`.
  - `menu-store.ts`:
    - `DEFAULT_MENU: Menu` (the spec's 5-item sample: 前蹴り 30, 回し蹴り 30, 休憩 15 rest, 追い突き 45, 平安初段 60).
    - `loadMenu(storage?: Storage): Menu` — reads key `"karate.menu"`, returns `DEFAULT_MENU` (deep copy) if absent/invalid.
    - `saveMenu(menu: Menu, storage?: Storage): void`.
    - `totalSeconds(menu: Menu): number`.
    - `formatMMSS(totalSeconds: number): string` — e.g. `180 → "3:00"`.
  - `storage` param defaults to `localStorage`; tests pass a fake so no jsdom needed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/menu-store.test.ts
import { describe, it, expect } from "vitest";
import { loadMenu, saveMenu, totalSeconds, formatMMSS, DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe("menu store", () => {
  it("returns the default menu when storage is empty", () => {
    expect(loadMenu(fakeStorage())).toEqual(DEFAULT_MENU);
  });
  it("round-trips a saved menu", () => {
    const s = fakeStorage();
    const menu = [{ id: "a", name: "前蹴り", seconds: 20, kind: "drill" as const }];
    saveMenu(menu, s);
    expect(loadMenu(s)).toEqual(menu);
  });
  it("falls back to default on corrupt data", () => {
    const s = fakeStorage();
    s.setItem("karate.menu", "{not json");
    expect(loadMenu(s)).toEqual(DEFAULT_MENU);
  });
  it("sums seconds including rests", () => {
    expect(totalSeconds(DEFAULT_MENU)).toBe(180);
  });
  it("formats mm:ss", () => {
    expect(formatMMSS(180)).toBe("3:00");
    expect(formatMMSS(65)).toBe("1:05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/menu-store.test.ts`
Expected: FAIL — module `menu-store` not found.

- [ ] **Step 3: Write types.ts**

```ts
// karate-trainer/src/types.ts
export interface Drill {
  id: string;
  name: string;
  seconds: number;
  kind: "drill" | "rest";
}
export type Menu = Drill[];
```

- [ ] **Step 4: Write menu-store.ts**

```ts
// karate-trainer/src/menu-store.ts
import type { Drill, Menu } from "./types";

const KEY = "karate.menu";

export const DEFAULT_MENU: Menu = [
  { id: "d1", name: "前蹴り", seconds: 30, kind: "drill" },
  { id: "d2", name: "回し蹴り", seconds: 30, kind: "drill" },
  { id: "d3", name: "休憩", seconds: 15, kind: "rest" },
  { id: "d4", name: "追い突き", seconds: 45, kind: "drill" },
  { id: "d5", name: "平安初段", seconds: 60, kind: "drill" },
];

function isMenu(v: unknown): v is Menu {
  return Array.isArray(v) && v.every(
    (d) => d && typeof (d as Drill).name === "string"
      && typeof (d as Drill).seconds === "number"
      && ((d as Drill).kind === "drill" || (d as Drill).kind === "rest"),
  );
}

export function loadMenu(storage: Storage = localStorage): Menu {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_MENU);
    const parsed = JSON.parse(raw);
    return isMenu(parsed) ? parsed : structuredClone(DEFAULT_MENU);
  } catch {
    return structuredClone(DEFAULT_MENU);
  }
}

export function saveMenu(menu: Menu, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(menu));
}

export function totalSeconds(menu: Menu): number {
  return menu.reduce((sum, d) => sum + d.seconds, 0);
}

export function formatMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/karate/menu-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add karate-trainer/src/types.ts karate-trainer/src/menu-store.ts tests/karate/menu-store.test.ts
git commit -m "feat(karate): menu store with localStorage persistence and totals"
```

---

### Task 3: Session scheduler (drill timing + cue events)

**Files:**
- Create: `karate-trainer/src/scheduler.ts`
- Test: `tests/karate/scheduler.test.ts`

**Interfaces:**
- Consumes: `Menu`, `Drill` from `types.ts`.
- Produces: `class SessionScheduler` driven by injected clock, emitting cue events. This is the heart of the app and the main unit-tested logic.
  - Constructor: `new SessionScheduler(menu: Menu, handlers: SchedulerHandlers, opts?: SchedulerOpts)`.
  - `SchedulerHandlers = { onDrillStart(drill: Drill, index: number, total: number): void; onTick(secondsLeft: number): void; onEncourage(): void; onCountdown(n: number): void; onDrillEnd(drill: Drill): void; onSessionEnd(): void }`.
  - `SchedulerOpts = { encourageEveryMs?: number; jitterMs?: number; rng?: () => number }` — defaults `encourageEveryMs=8500`, `jitterMs=2000`, `rng=Math.random`.
  - Methods: `start(): void`, `pause(): void`, `resume(): void`, `skip(): void`, `stop(): void`, `tick(deltaMs: number): void`.
  - The scheduler owns no timer of its own; the caller pumps `tick(deltaMs)` (from `requestAnimationFrame`/`setInterval` in prod, from the test manually). This is why it's fully testable.
  - Rules: on entering a drill, fire `onDrillStart`. Every whole second remaining, fire `onTick`. Fire `onCountdown(3|2|1)` in the final 3 seconds. Fire `onEncourage` on an interval of `encourageEveryMs ± jitter`, but NOT during the final-3s countdown window and NOT for `rest` drills. At 0, fire `onDrillEnd` then advance; after the last drill fire `onSessionEnd`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/scheduler.test.ts
import { describe, it, expect, vi } from "vitest";
import { SessionScheduler } from "../../karate-trainer/src/scheduler";
import type { Menu } from "../../karate-trainer/src/types";

function handlers() {
  return {
    onDrillStart: vi.fn(), onTick: vi.fn(), onEncourage: vi.fn(),
    onCountdown: vi.fn(), onDrillEnd: vi.fn(), onSessionEnd: vi.fn(),
  };
}
const menu: Menu = [
  { id: "a", name: "前蹴り", seconds: 5, kind: "drill" },
  { id: "b", name: "休憩", seconds: 3, kind: "rest" },
];

function pump(s: SessionScheduler, ms: number, step = 250) {
  for (let t = 0; t < ms; t += step) s.tick(step);
}

describe("SessionScheduler", () => {
  it("announces the first drill on start", () => {
    const h = handlers();
    new SessionScheduler(menu, h).start();
    expect(h.onDrillStart).toHaveBeenCalledWith(menu[0], 0, 2);
  });

  it("fires a 3-2-1 countdown in the final three seconds", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 5000);
    expect(h.onCountdown.mock.calls.map((c) => c[0])).toEqual([3, 2, 1]);
  });

  it("advances to the next drill and ends the session", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 5000);
    expect(h.onDrillStart).toHaveBeenCalledWith(menu[1], 1, 2);
    pump(s, 3000);
    expect(h.onSessionEnd).toHaveBeenCalledOnce();
  });

  it("never encourages during a rest drill", () => {
    const h = handlers();
    // tiny interval so it WOULD fire every 250ms if allowed
    const s = new SessionScheduler(menu, h, { encourageEveryMs: 250, jitterMs: 0, rng: () => 0.5 });
    s.start();
    pump(s, 5000);      // drill 1 done
    h.onEncourage.mockClear();
    pump(s, 3000);      // the rest drill
    expect(h.onEncourage).not.toHaveBeenCalled();
  });

  it("pause freezes the countdown", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 2000);
    s.pause();
    h.onTick.mockClear();
    pump(s, 2000);
    expect(h.onTick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/scheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scheduler**

```ts
// karate-trainer/src/scheduler.ts
import type { Menu, Drill } from "./types";

export interface SchedulerHandlers {
  onDrillStart(drill: Drill, index: number, total: number): void;
  onTick(secondsLeft: number): void;
  onEncourage(): void;
  onCountdown(n: number): void;
  onDrillEnd(drill: Drill): void;
  onSessionEnd(): void;
}
export interface SchedulerOpts {
  encourageEveryMs?: number;
  jitterMs?: number;
  rng?: () => number;
}

export class SessionScheduler {
  private idx = -1;
  private remainingMs = 0;
  private lastWholeSecond = -1;
  private nextEncourageMs = 0;
  private paused = false;
  private done = false;
  private readonly everyMs: number;
  private readonly jitterMs: number;
  private readonly rng: () => number;

  constructor(private menu: Menu, private h: SchedulerHandlers, opts: SchedulerOpts = {}) {
    this.everyMs = opts.encourageEveryMs ?? 8500;
    this.jitterMs = opts.jitterMs ?? 2000;
    this.rng = opts.rng ?? Math.random;
  }

  start(): void { this.enter(0); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  stop(): void { this.done = true; }
  skip(): void { if (!this.done) this.finishDrill(); }

  private scheduleEncourage(): void {
    this.nextEncourageMs = this.everyMs + (this.rng() * 2 - 1) * this.jitterMs;
  }

  private enter(i: number): void {
    if (i >= this.menu.length) { this.done = true; this.h.onSessionEnd(); return; }
    this.idx = i;
    const drill = this.menu[i];
    this.remainingMs = drill.seconds * 1000;
    this.lastWholeSecond = drill.seconds;
    this.scheduleEncourage();
    this.h.onDrillStart(drill, i, this.menu.length);
    this.h.onTick(drill.seconds);
  }

  private finishDrill(): void {
    const drill = this.menu[this.idx];
    this.h.onDrillEnd(drill);
    this.enter(this.idx + 1);
  }

  tick(deltaMs: number): void {
    if (this.done || this.paused || this.idx < 0) return;
    const drill = this.menu[this.idx];
    this.remainingMs -= deltaMs;

    const secondsLeft = Math.max(0, Math.ceil(this.remainingMs / 1000));
    if (secondsLeft !== this.lastWholeSecond) {
      this.lastWholeSecond = secondsLeft;
      if (secondsLeft > 0) this.h.onTick(secondsLeft);
      if (secondsLeft >= 1 && secondsLeft <= 3) this.h.onCountdown(secondsLeft);
    }

    // encouragement: not in final-3s window, not on rests
    const inCountdownWindow = this.remainingMs <= 3000;
    if (drill.kind !== "rest" && !inCountdownWindow) {
      this.nextEncourageMs -= deltaMs;
      if (this.nextEncourageMs <= 0) {
        this.h.onEncourage();
        this.scheduleEncourage();
      }
    }

    if (this.remainingMs <= 0) this.finishDrill();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/scheduler.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/scheduler.ts tests/karate/scheduler.test.ts
git commit -m "feat(karate): pumped session scheduler with cue events"
```

---

### Task 4: Cue player (recorded clips → beep/TTS fallback)

**Files:**
- Create: `karate-trainer/src/cue-player.ts`
- Test: `tests/karate/cue-player.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (defines its own `CueRole` and a `ClipSource` interface the voice store will satisfy in Task 7).
- Produces:
  - `type CueRole = "announce" | "countdown" | "encouragement"`.
  - `interface ClipSource { list(role: CueRole): { id: string; url: string }[] }` — returns recorded clips for a role (empty array ⇒ use fallback).
  - `interface CueSink { playUrl(url: string): Promise<void>; beep(): Promise<void>; speak(text: string): Promise<void> }` — the browser wrappers (real impl in Task 5); injected so this unit is testable.
  - `class CuePlayer` with:
    - `constructor(source: ClipSource, sink: CueSink, rng?: () => number)`.
    - `announce(): Promise<void>` — plays a recorded announce clip if any, else `speak("始め")`.
    - `encourage(): Promise<void>` — plays a random recorded encouragement clip if any, else `speak` a random default phrase from `["もっと早く", "一生懸命", "いいぞ"]`.
    - `countdown(n: number): Promise<void>` — plays a recorded countdown clip if any, else `beep()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/cue-player.test.ts
import { describe, it, expect, vi } from "vitest";
import { CuePlayer } from "../../karate-trainer/src/cue-player";
import type { CueRole } from "../../karate-trainer/src/cue-player";

function sink() {
  return {
    playUrl: vi.fn().mockResolvedValue(undefined),
    beep: vi.fn().mockResolvedValue(undefined),
    speak: vi.fn().mockResolvedValue(undefined),
  };
}
const emptySource = { list: (_r: CueRole) => [] as { id: string; url: string }[] };

describe("CuePlayer", () => {
  it("beeps for countdown when no recorded clips", async () => {
    const s = sink();
    await new CuePlayer(emptySource, s).countdown(3);
    expect(s.beep).toHaveBeenCalledOnce();
    expect(s.playUrl).not.toHaveBeenCalled();
  });

  it("speaks a default phrase when no encouragement clips", async () => {
    const s = sink();
    await new CuePlayer(emptySource, s, () => 0).encourage();
    expect(s.speak).toHaveBeenCalledWith("もっと早く");
  });

  it("plays a recorded clip when one exists", async () => {
    const s = sink();
    const source = { list: (r: CueRole) => r === "announce" ? [{ id: "1", url: "blob:x" }] : [] };
    await new CuePlayer(source, s).announce();
    expect(s.playUrl).toHaveBeenCalledWith("blob:x");
    expect(s.speak).not.toHaveBeenCalled();
  });

  it("picks a random recorded encouragement clip", async () => {
    const s = sink();
    const clips = [{ id: "1", url: "a" }, { id: "2", url: "b" }];
    const source = { list: (r: CueRole) => r === "encouragement" ? clips : [] };
    await new CuePlayer(source, s, () => 0.99).encourage();
    expect(s.playUrl).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/cue-player.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cue player**

```ts
// karate-trainer/src/cue-player.ts
export type CueRole = "announce" | "countdown" | "encouragement";

export interface ClipSource {
  list(role: CueRole): { id: string; url: string }[];
}
export interface CueSink {
  playUrl(url: string): Promise<void>;
  beep(): Promise<void>;
  speak(text: string): Promise<void>;
}

const DEFAULT_ENCOURAGE = ["もっと早く", "一生懸命", "いいぞ"];

export class CuePlayer {
  constructor(
    private source: ClipSource,
    private sink: CueSink,
    private rng: () => number = Math.random,
  ) {}

  private pick<T>(arr: T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.rng() * arr.length))];
  }

  async announce(): Promise<void> {
    const clips = this.source.list("announce");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.speak("始め");
  }

  async encourage(): Promise<void> {
    const clips = this.source.list("encouragement");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.speak(this.pick(DEFAULT_ENCOURAGE));
  }

  async countdown(_n: number): Promise<void> {
    const clips = this.source.list("countdown");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.beep();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/cue-player.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/cue-player.ts tests/karate/cue-player.test.ts
git commit -m "feat(karate): cue player with recorded-clip → beep/TTS fallback"
```

---

### Task 5: Browser audio sink (WebAudio beep + Web Speech + clip playback)

**Files:**
- Create: `karate-trainer/src/audio-sink.ts`
- Test: `tests/karate/audio-sink.test.ts`

**Interfaces:**
- Consumes: `CueSink` shape from `cue-player.ts`.
- Produces: `class BrowserAudioSink implements CueSink` — real `AudioContext` beep, `speechSynthesis` (ja-JP) speak, and `new Audio(url).play()` for clips. Because these APIs don't exist in jsdom, the class takes injectable factories with real defaults so a test can verify the wiring.
  - `constructor(deps?: { makeAudio?: (url: string) => HTMLAudioElement; synth?: SpeechSynthesis; audioCtx?: AudioContext })`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/audio-sink.test.ts
import { describe, it, expect, vi } from "vitest";
import { BrowserAudioSink } from "../../karate-trainer/src/audio-sink";

describe("BrowserAudioSink", () => {
  it("plays a clip url via the audio element", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const el = { play, addEventListener: (e: string, cb: () => void) => e === "ended" && cb() } as unknown as HTMLAudioElement;
    const sink = new BrowserAudioSink({ makeAudio: () => el });
    await sink.playUrl("blob:x");
    expect(play).toHaveBeenCalledOnce();
  });

  it("speaks via the injected synth", async () => {
    const speak = vi.fn((u: SpeechSynthesisUtterance) => (u.onend as () => void)?.());
    const synth = { speak, cancel: vi.fn() } as unknown as SpeechSynthesis;
    const sink = new BrowserAudioSink({ synth });
    await sink.speak("もっと早く");
    expect(speak).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/audio-sink.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sink**

```ts
// karate-trainer/src/audio-sink.ts
import type { CueSink } from "./cue-player";

export interface AudioSinkDeps {
  makeAudio?: (url: string) => HTMLAudioElement;
  synth?: SpeechSynthesis;
  audioCtx?: AudioContext;
}

export class BrowserAudioSink implements CueSink {
  private makeAudio: (url: string) => HTMLAudioElement;
  private synth?: SpeechSynthesis;
  private ctx?: AudioContext;

  constructor(deps: AudioSinkDeps = {}) {
    this.makeAudio = deps.makeAudio ?? ((url) => new Audio(url));
    this.synth = deps.synth ?? (typeof speechSynthesis !== "undefined" ? speechSynthesis : undefined);
    this.ctx = deps.audioCtx;
  }

  playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = this.makeAudio(url);
      el.addEventListener("ended", () => resolve(), { once: true });
      el.addEventListener("error", () => resolve(), { once: true });
      void el.play().catch(() => resolve());
    });
  }

  speak(text: string): Promise<void> {
    if (!this.synth) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.synth!.speak(u);
    });
  }

  beep(): Promise<void> {
    try {
      this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch { /* audio unavailable — silent */ }
    return Promise.resolve();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/audio-sink.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/audio-sink.ts tests/karate/audio-sink.test.ts
git commit -m "feat(karate): browser audio sink (beep, TTS, clip playback)"
```

---

### Task 6: Video recorder wrapper (getUserMedia + MediaRecorder)

**Files:**
- Create: `karate-trainer/src/recorder.ts`
- Test: `tests/karate/recorder.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `class VideoRecorder` wrapping camera capture + recording. Browser APIs are injected so logic (mime selection, blob assembly) is testable.
  - `constructor(deps?: { getMedia?: typeof navigator.mediaDevices.getUserMedia; makeRecorder?: (s: MediaStream, mime: string) => MediaRecorder })`.
  - `async startCamera(): Promise<MediaStream>` — front camera + mic: `getUserMedia({ video: { facingMode: "user" }, audio: true })`. Returns the stream (caller shows it mirrored in a `<video>`).
  - `startRecording(): void` — begins `MediaRecorder` on the stream, collecting chunks.
  - `async stop(): Promise<Blob>` — stops recorder + camera tracks, returns the assembled blob.
  - `pickMime(): string` — returns the first of `["video/mp4", "video/webm;codecs=vp9", "video/webm"]` that `MediaRecorder.isTypeSupported` accepts (mp4 first for iOS).
  - `fileExtension(): string` — `"mp4"` or `"webm"` matching the chosen mime.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/recorder.test.ts
import { describe, it, expect, vi } from "vitest";
import { VideoRecorder } from "../../karate-trainer/src/recorder";

describe("VideoRecorder", () => {
  it("prefers mp4 when supported (iOS)", () => {
    const spy = vi.spyOn(MediaRecorder ?? ({} as never), "isTypeSupported");
    // stub global if absent in jsdom-less env
    (globalThis as any).MediaRecorder = { isTypeSupported: (t: string) => t === "video/mp4" };
    const r = new VideoRecorder();
    expect(r.pickMime()).toBe("video/mp4");
    expect(r.fileExtension()).toBe("mp4");
    spy.mockRestore?.();
  });

  it("assembles recorded chunks into one blob", async () => {
    (globalThis as any).MediaRecorder = class {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() { return true; }
      constructor(public stream: MediaStream, public opts: { mimeType: string }) {}
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(["ab"], { type: "video/mp4" }) });
        this.onstop?.();
      }
    };
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const r = new VideoRecorder({ getMedia: async () => fakeStream });
    await r.startCamera();
    r.startRecording();
    const blob = await r.stop();
    expect(blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/recorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the recorder**

```ts
// karate-trainer/src/recorder.ts
const MIME_CANDIDATES = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];

export interface RecorderDeps {
  getMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  makeRecorder?: (s: MediaStream, mime: string) => MediaRecorder;
}

export class VideoRecorder {
  private getMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  private makeRecorder: (s: MediaStream, mime: string) => MediaRecorder;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private mime = "";

  constructor(deps: RecorderDeps = {}) {
    this.getMedia = deps.getMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    this.makeRecorder = deps.makeRecorder ?? ((s, mime) => new MediaRecorder(s, { mimeType: mime }));
  }

  pickMime(): string {
    const supported = (t: string) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t);
    return MIME_CANDIDATES.find(supported) ?? "video/mp4";
  }

  fileExtension(): string {
    return this.pickMime().startsWith("video/mp4") ? "mp4" : "webm";
  }

  async startCamera(): Promise<MediaStream> {
    this.stream = await this.getMedia({ video: { facingMode: "user" }, audio: true });
    return this.stream;
  }

  startRecording(): void {
    if (!this.stream) throw new Error("camera not started");
    this.mime = this.pickMime();
    this.chunks = [];
    this.recorder = this.makeRecorder(this.stream, this.mime);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.mime || "video/mp4" }));
      };
      if (!this.recorder) return finish();
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/recorder.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/recorder.ts tests/karate/recorder.test.ts
git commit -m "feat(karate): video recorder wrapper with iOS-first mime pick"
```

---

### Task 7: Voice store (record clips + IndexedDB + export/import)

**Files:**
- Create: `karate-trainer/src/voice-store.ts`
- Test: `tests/karate/voice-store.test.ts`

**Interfaces:**
- Consumes: `CueRole` from `cue-player.ts` (`"announce" | "countdown" | "encouragement"`); satisfies `ClipSource` from Task 4.
- Produces: `class VoiceStore` — persists recorded audio blobs keyed by role in IndexedDB, and exposes them as object URLs for the cue player.
  - `interface StoredClip { id: string; role: CueRole; label: string; blob: Blob }`.
  - `constructor(db?: IDBFactory)` — defaults to `indexedDB`; tests pass `fake-indexeddb` OR an in-memory adapter (see below).
  - `async init(): Promise<void>` — opens/creates the DB + object store.
  - `async add(role: CueRole, label: string, blob: Blob): Promise<StoredClip>`.
  - `async remove(id: string): Promise<void>`.
  - `async all(): Promise<StoredClip[]>`.
  - `list(role: CueRole): { id: string; url: string }[]` — synchronous view over an in-memory cache (created via `URL.createObjectURL`) so it satisfies `ClipSource`; the cache is refreshed by `init`/`add`/`remove`.
  - `async export(): Promise<Blob>` — bundles all clips as JSON (base64 blobs) for backup download.
  - `async import(file: Blob): Promise<void>` — restores from an exported bundle.
- **Test approach:** to avoid a new dependency, the store talks to a tiny injected `KvAdapter` interface (`get/set/delete/entries`) with an IndexedDB implementation for prod and an in-memory `Map` implementation in the test. `constructor(kv: KvAdapter)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/voice-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    entries: async () => [...m.entries()],
  };
}

beforeEach(() => {
  // jsdom lacks URL.createObjectURL
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:fake");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("VoiceStore", () => {
  it("adds a clip and lists it by role", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    await store.add("encouragement", "もっと早く", new Blob(["x"]));
    expect(store.list("encouragement")).toHaveLength(1);
    expect(store.list("announce")).toHaveLength(0);
  });

  it("persists across a fresh instance on the same kv", async () => {
    const kv = memKv();
    const a = new VoiceStore(kv);
    await a.init();
    await a.add("announce", "始め", new Blob(["y"]));
    const b = new VoiceStore(kv);
    await b.init();
    expect(b.list("announce")).toHaveLength(1);
  });

  it("removes a clip", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    const clip = await store.add("countdown", "3", new Blob(["z"]));
    await store.remove(clip.id);
    expect(store.list("countdown")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/voice-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the voice store**

```ts
// karate-trainer/src/voice-store.ts
import type { CueRole } from "./cue-player";

export interface StoredClip { id: string; role: CueRole; label: string; blob: Blob }

export interface KvAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  entries(): Promise<[string, unknown][]>;
}

// IndexedDB-backed KvAdapter for production.
export function idbKv(dbName = "karate-voice"): KvAdapter {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = async (mode: IDBTransactionMode) =>
    (await open()).transaction("clips", mode).objectStore("clips");
  return {
    async get(k) { const s = await tx("readonly"); return new Promise((r) => { const q = s.get(k); q.onsuccess = () => r(q.result); }); },
    async set(k, v) { const s = await tx("readwrite"); return new Promise((r) => { s.put(v, k).onsuccess = () => r(); }); },
    async delete(k) { const s = await tx("readwrite"); return new Promise((r) => { s.delete(k).onsuccess = () => r(); }); },
    async entries() { const s = await tx("readonly"); return new Promise((r) => {
      const out: [string, unknown][] = [];
      const c = s.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push([String(cur.key), cur.value]); cur.continue(); } else r(out); };
    }); },
  };
}

let counter = 0;
const nextId = () => `clip-${counter++}-${(globalThis.crypto?.randomUUID?.() ?? String(counter))}`;

export class VoiceStore {
  private clips = new Map<string, StoredClip>();
  private urls = new Map<string, string>();

  constructor(private kv: KvAdapter) {}

  async init(): Promise<void> {
    for (const [key, value] of await this.kv.entries()) {
      const clip = value as StoredClip;
      this.clips.set(key, clip);
      this.urls.set(key, URL.createObjectURL(clip.blob));
    }
  }

  async add(role: CueRole, label: string, blob: Blob): Promise<StoredClip> {
    const clip: StoredClip = { id: nextId(), role, label, blob };
    await this.kv.set(clip.id, clip);
    this.clips.set(clip.id, clip);
    this.urls.set(clip.id, URL.createObjectURL(blob));
    return clip;
  }

  async remove(id: string): Promise<void> {
    await this.kv.delete(id);
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.clips.delete(id);
  }

  async all(): Promise<StoredClip[]> {
    return [...this.clips.values()];
  }

  list(role: CueRole): { id: string; url: string }[] {
    return [...this.clips.values()]
      .filter((c) => c.role === role)
      .map((c) => ({ id: c.id, url: this.urls.get(c.id)! }));
  }

  async export(): Promise<Blob> {
    const toB64 = (b: Blob) => new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res((fr.result as string).split(",")[1] ?? "");
      fr.readAsDataURL(b);
    });
    const items = await Promise.all([...this.clips.values()].map(async (c) => ({
      role: c.role, label: c.label, type: c.blob.type, data: await toB64(c.blob),
    })));
    return new Blob([JSON.stringify({ version: 1, items })], { type: "application/json" });
  }

  async import(file: Blob): Promise<void> {
    const text = await file.text();
    const parsed = JSON.parse(text) as { items: { role: CueRole; label: string; type: string; data: string }[] };
    for (const it of parsed.items) {
      const bytes = Uint8Array.from(atob(it.data), (ch) => ch.charCodeAt(0));
      await this.add(it.role, it.label, new Blob([bytes], { type: it.type }));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/voice-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/voice-store.ts tests/karate/voice-store.test.ts
git commit -m "feat(karate): voice store (IndexedDB clips + export/import)"
```

---

### Task 8: Voice recorder (audio-only capture for cues)

**Files:**
- Create: `karate-trainer/src/voice-recorder.ts`
- Test: `tests/karate/voice-recorder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class VoiceRecorder` — records a single short audio clip. Same injectable pattern as `VideoRecorder` but audio-only and mp4/webm-audio agnostic.
  - `constructor(deps?: { getMedia?: ...; makeRecorder?: ... })`.
  - `async start(): Promise<void>` — `getUserMedia({ audio: true })` then start recording.
  - `async stop(): Promise<Blob>` — stop, release mic, return the clip blob.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/voice-recorder.test.ts
import { describe, it, expect, vi } from "vitest";
import { VoiceRecorder } from "../../karate-trainer/src/voice-recorder";

it("records an audio clip into a blob", async () => {
  (globalThis as any).MediaRecorder = class {
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    static isTypeSupported() { return true; }
    start() {}
    stop() { this.ondataavailable?.({ data: new Blob(["a"]) }); this.onstop?.(); }
  };
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const r = new VoiceRecorder({ getMedia: async () => stream });
  await r.start();
  const blob = await r.stop();
  expect(blob.size).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/voice-recorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the voice recorder**

```ts
// karate-trainer/src/voice-recorder.ts
const AUDIO_MIMES = ["audio/mp4", "audio/webm", "audio/ogg"];

export interface VoiceRecorderDeps {
  getMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  makeRecorder?: (s: MediaStream, mime: string) => MediaRecorder;
}

export class VoiceRecorder {
  private getMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  private makeRecorder: (s: MediaStream, mime: string) => MediaRecorder;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private mime = "";

  constructor(deps: VoiceRecorderDeps = {}) {
    this.getMedia = deps.getMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    this.makeRecorder = deps.makeRecorder ?? ((s, mime) => new MediaRecorder(s, mime ? { mimeType: mime } : undefined));
  }

  private pickMime(): string {
    const ok = (t: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t);
    return AUDIO_MIMES.find(ok) ?? "";
  }

  async start(): Promise<void> {
    this.stream = await this.getMedia({ audio: true });
    this.mime = this.pickMime();
    this.chunks = [];
    this.recorder = this.makeRecorder(this.stream, this.mime);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.mime || "audio/mp4" }));
      };
      if (!this.recorder) return finish();
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/voice-recorder.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/voice-recorder.ts tests/karate/voice-recorder.test.ts
git commit -m "feat(karate): audio-only voice recorder for cue capture"
```

---

### Task 9: Wake lock helper

**Files:**
- Create: `karate-trainer/src/wake-lock.ts`
- Test: `tests/karate/wake-lock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class WakeGuard` — requests a screen wake lock, re-acquires on visibility change, releases on demand. Degrades silently where unsupported (older iOS).
  - `constructor(nav?: Navigator)`.
  - `async acquire(): Promise<void>`.
  - `async release(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/karate/wake-lock.test.ts
import { describe, it, expect, vi } from "vitest";
import { WakeGuard } from "../../karate-trainer/src/wake-lock";

it("acquires and releases a wake lock when supported", async () => {
  const sentinel = { release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockResolvedValue(sentinel);
  const nav = { wakeLock: { request } } as unknown as Navigator;
  const g = new WakeGuard(nav);
  await g.acquire();
  expect(request).toHaveBeenCalledWith("screen");
  await g.release();
  expect(sentinel.release).toHaveBeenCalledOnce();
});

it("no-ops when wakeLock is unavailable", async () => {
  const g = new WakeGuard({} as Navigator);
  await expect(g.acquire()).resolves.toBeUndefined();
  await expect(g.release()).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/wake-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the wake guard**

```ts
// karate-trainer/src/wake-lock.ts
export class WakeGuard {
  private sentinel: WakeLockSentinel | null = null;
  constructor(private nav: Navigator = navigator) {}

  async acquire(): Promise<void> {
    const wl = (this.nav as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;
    try { this.sentinel = await wl.request("screen"); } catch { /* denied — ignore */ }
  }

  async release(): Promise<void> {
    try { await this.sentinel?.release(); } catch { /* ignore */ }
    this.sentinel = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/wake-lock.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/wake-lock.ts tests/karate/wake-lock.test.ts
git commit -m "feat(karate): wake lock helper with silent fallback"
```

---

### Task 10: Setup screen UI (menu editor)

**Files:**
- Create: `karate-trainer/src/ui/setup-screen.ts`
- Modify: `karate-trainer/style.css` (add setup styles from the mockup)
- Test: `tests/karate/setup-screen.test.ts`

**Interfaces:**
- Consumes: `Menu`, `Drill` (types); `loadMenu`, `saveMenu`, `totalSeconds`, `formatMMSS` (menu-store).
- Produces: `function renderSetupScreen(root: HTMLElement, deps: SetupDeps): void` where `SetupDeps = { menu: Menu; onChange(menu: Menu): void; onStart(): void; onOpenVoice(): void }`. Renders the editable rows, add/delete controls, total, and the start button. Editing a row's name/seconds calls `onChange` with the updated menu.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/setup-screen.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

it("renders a row per drill and fires onStart", () => {
  const root = document.createElement("div");
  const onStart = vi.fn();
  renderSetupScreen(root, { menu: structuredClone(DEFAULT_MENU), onChange: vi.fn(), onStart, onOpenVoice: vi.fn() });
  expect(root.querySelectorAll("[data-row]")).toHaveLength(DEFAULT_MENU.length);
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  expect(onStart).toHaveBeenCalledOnce();
});

it("adding a drill fires onChange with a longer menu", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, { menu: structuredClone(DEFAULT_MENU), onChange, onStart: vi.fn(), onOpenVoice: vi.fn() });
  root.querySelector<HTMLButtonElement>("[data-add]")!.click();
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0].length).toBe(DEFAULT_MENU.length + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/setup-screen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the setup screen**

Render from `deps.menu`: a header (`今日の稽古`), a `[data-rows]` container with one `[data-row]` per drill (name input, seconds input, delete button, `data-rest` toggle), a `[data-add]` button (appends `{ id, name: "新しい種目", seconds: 30, kind: "drill" }` and calls `onChange`), a footer showing `合計 N 種目 · ${formatMMSS(totalSeconds(menu))}`, a `[data-voice]` button (`声を録音` → `onOpenVoice`), and a `[data-start]` button (`稽古 開始 ▶` → `onStart`). Wire `input` events on name/seconds to produce a new menu array and call `onChange`. Keep DOM construction with `document.createElement`; no innerHTML with user text.

```ts
// karate-trainer/src/ui/setup-screen.ts
import type { Menu } from "../types";
import { totalSeconds, formatMMSS } from "../menu-store";

export interface SetupDeps {
  menu: Menu;
  onChange(menu: Menu): void;
  onStart(): void;
  onOpenVoice(): void;
}

let idc = 0;
const uid = () => `d${Date.now()}-${idc++}`;

export function renderSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  const menu = deps.menu;
  root.textContent = "";
  root.className = "screen setup";

  const rows = document.createElement("div");
  rows.dataset.rows = "";
  menu.forEach((drill, i) => {
    const row = document.createElement("div");
    row.dataset.row = "";
    row.className = "row" + (drill.kind === "rest" ? " rest" : "");

    const name = document.createElement("input");
    name.value = drill.name;
    name.className = "drill-name";
    name.addEventListener("input", () => {
      const next = menu.map((d, j) => j === i ? { ...d, name: name.value } : d);
      deps.onChange(next);
    });

    const secs = document.createElement("input");
    secs.type = "number"; secs.min = "1"; secs.value = String(drill.seconds);
    secs.className = "drill-secs";
    secs.addEventListener("input", () => {
      const n = Math.max(1, Number(secs.value) || 1);
      deps.onChange(menu.map((d, j) => j === i ? { ...d, seconds: n } : d));
    });

    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "row-del";
    del.addEventListener("click", () => deps.onChange(menu.filter((_, j) => j !== i)));

    row.append(name, secs, del);
    rows.append(row);
  });

  const add = document.createElement("button");
  add.dataset.add = ""; add.className = "add"; add.textContent = "＋ ドリルを追加";
  add.addEventListener("click", () =>
    deps.onChange([...menu, { id: uid(), name: "新しい種目", seconds: 30, kind: "drill" }]));

  const total = document.createElement("div");
  total.className = "total";
  total.textContent = `合計 ${menu.length} 種目 · ${formatMMSS(totalSeconds(menu))}`;

  const voice = document.createElement("button");
  voice.dataset.voice = ""; voice.className = "btn-ghost"; voice.textContent = "声を録音";
  voice.addEventListener("click", () => deps.onOpenVoice());

  const start = document.createElement("button");
  start.dataset.start = ""; start.className = "btn-start"; start.textContent = "稽古 開始 ▶";
  start.addEventListener("click", () => deps.onStart());

  root.append(rows, add, total, voice, start);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/setup-screen.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/setup-screen.ts karate-trainer/style.css tests/karate/setup-screen.test.ts
git commit -m "feat(karate): setup screen menu editor"
```

---

### Task 11: Training screen UI (camera view + timer + cue toast)

**Files:**
- Create: `karate-trainer/src/ui/training-screen.ts`
- Modify: `karate-trainer/style.css` (training styles from the mockup — full-bleed video, big timer, thumb-zone controls, mirrored preview)
- Test: `tests/karate/training-screen.test.ts`

**Interfaces:**
- Consumes: `Drill` (type).
- Produces: `function renderTrainingScreen(root: HTMLElement): TrainingView` where `TrainingView` is an imperative handle the main wiring drives:
  - `videoEl: HTMLVideoElement` (mirrored via CSS class `mirror`, has `playsinline` + `muted`).
  - `setDrill(drill: Drill, index: number, total: number): void`.
  - `setTime(secondsLeft: number): void`.
  - `showCue(text: string): void` (toast, auto-hides).
  - `setNext(text: string | null): void`.
  - `setRecElapsed(text: string): void`.
  - `onPause(cb): void; onSkip(cb): void; onStop(cb): void`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/training-screen.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderTrainingScreen } from "../../karate-trainer/src/ui/training-screen";

it("mirrors the video and updates the timer", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  expect(view.videoEl.hasAttribute("playsinline")).toBe(true);
  expect(view.videoEl.muted).toBe(true);
  expect(view.videoEl.classList.contains("mirror")).toBe(true);
  view.setTime(18);
  expect(root.querySelector("[data-timer]")!.textContent).toContain("18");
});

it("fires stop handler", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const onStop = vi.fn();
  view.onStop(onStop);
  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  expect(onStop).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/training-screen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the training screen**

Build the DOM from the mockup: `<video class="mirror" playsinline muted>`, top bar (`[data-rec]`, `[data-prog]`), center (`[data-drill]`, `[data-timer]`), `[data-cue]` toast (add/remove a `show` class, auto-hide after ~1.6s), `[data-next]` hint, and three thumb-zone buttons (`[data-pause]`, `[data-skip]`, `[data-stop]`). Return the `TrainingView` handle wiring each setter/handler. Set `videoEl.muted = true` and `videoEl.setAttribute("playsinline", "")` explicitly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/training-screen.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/training-screen.ts karate-trainer/style.css tests/karate/training-screen.test.ts
git commit -m "feat(karate): training screen (mirrored cam, big timer, cue toast)"
```

---

### Task 12: Done screen UI (playback + download + restart)

**Files:**
- Create: `karate-trainer/src/ui/done-screen.ts`
- Modify: `karate-trainer/style.css` (done styles)
- Test: `tests/karate/done-screen.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function renderDoneScreen(root, deps): void` where `deps = { videoUrl: string; ext: string; stats: { time: string; drills: number; cues: number }; onDownload(): void; onAgain(): void }`. Shows a `<video controls playsinline>` at `videoUrl`, the three stats, a download button (`動画を保存 (.${ext})` → `onDownload`), and a restart button (`もう一度 稽古する` → `onAgain`).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/done-screen.test.ts
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";

it("shows stats and fires download", () => {
  const root = document.createElement("div");
  const onDownload = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onDownload, onAgain: vi.fn(),
  });
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:v");
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl.textContent).toContain("mp4");
  dl.click();
  expect(onDownload).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the done screen**

```ts
// karate-trainer/src/ui/done-screen.ts
export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onDownload(): void;
  onAgain(): void;
}

export function renderDoneScreen(root: HTMLElement, deps: DoneDeps): void {
  root.textContent = "";
  root.className = "screen done";

  const video = document.createElement("video");
  video.setAttribute("src", deps.videoUrl);
  video.setAttribute("playsinline", "");
  video.controls = true;

  const stats = document.createElement("div");
  stats.className = "stats";
  const stat = (v: string | number, k: string) => {
    const el = document.createElement("div"); el.className = "stat";
    el.innerHTML = `<div class="v"></div><div class="k"></div>`;
    el.querySelector(".v")!.textContent = String(v);
    el.querySelector(".k")!.textContent = k;
    return el;
  };
  stats.append(stat(deps.stats.time, "時間"), stat(deps.stats.drills, "種目"), stat(deps.stats.cues, "掛け声"));

  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  dl.textContent = `⬇ 動画を保存 (.${deps.ext})`;
  dl.addEventListener("click", () => deps.onDownload());

  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する";
  again.addEventListener("click", () => deps.onAgain());

  root.append(video, stats, dl, again);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/done-screen.ts karate-trainer/style.css tests/karate/done-screen.test.ts
git commit -m "feat(karate): done screen (playback, download, restart)"
```

---

### Task 13: Voice screen UI (record/list/delete + export/import)

**Files:**
- Create: `karate-trainer/src/ui/voice-screen.ts`
- Modify: `karate-trainer/style.css` (voice styles)
- Test: `tests/karate/voice-screen.test.ts`

**Interfaces:**
- Consumes: `CueRole` (cue-player); `VoiceStore` (voice-store); `VoiceRecorder` (voice-recorder).
- Produces: `function renderVoiceScreen(root, deps): void` where `deps = { store: VoiceStore; makeRecorder(): { start(): Promise<void>; stop(): Promise<Blob> }; onBack(): void }`. Lists clips grouped by role; a role selector + optional label field + `録音`/`停止` button records via `makeRecorder()` and saves to `store`; each clip has play + delete; footer has Export (download bundle) / Import (file input) and a **caveat line** ("この端末のSafariにのみ保存されます"). The record button must be the user gesture that starts the recorder.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/voice-screen.test.ts
import { it, expect, vi, beforeEach } from "vitest";
import { renderVoiceScreen } from "../../karate-trainer/src/ui/voice-screen";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}
beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:fake");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

it("records a clip and shows it in the list", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  const rec = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob(["x"])) };
  renderVoiceScreen(root, { store, makeRecorder: () => rec, onBack: vi.fn() });

  root.querySelector<HTMLButtonElement>("[data-record]")!.click();      // start
  await Promise.resolve();
  await root.querySelector<HTMLButtonElement>("[data-record]")!.click(); // stop + save
  await new Promise((r) => setTimeout(r, 0));

  expect(rec.start).toHaveBeenCalled();
  expect(rec.stop).toHaveBeenCalled();
  expect(store.list("encouragement").length + store.list("announce").length).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/voice-screen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the voice screen**

Render: a back button (`onBack`), a role `<select>` (announce/countdown/encouragement), a label `<input>` (for encouragement phrases), a `[data-record]` toggle button that on first click calls `makeRecorder()` + `start()` and flips to `停止`, on second click `stop()` → `store.add(role, label, blob)` → re-render list. A `[data-list]` grouped by role, each clip with a play button (`new Audio(url).play()`) and delete (`store.remove` → re-render). Footer: `[data-export]` (calls `store.export()` → triggers a download), `[data-import]` file input (`store.import(file)` → re-render), and the caveat line. Keep a small internal `refresh()` that rebuilds `[data-list]` from `store.all()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/voice-screen.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/voice-screen.ts karate-trainer/style.css tests/karate/voice-screen.test.ts
git commit -m "feat(karate): voice screen (record/list/delete + export/import)"
```

---

### Task 14: App wiring (main.ts — screens, session loop, download)

**Files:**
- Modify: `karate-trainer/src/main.ts` (replace stub)
- Create: `karate-trainer/src/app.ts` (the controller wiring all units)
- Test: `tests/karate/app.test.ts`

**Interfaces:**
- Consumes: every unit above.
- Produces: `class KarateApp` with `constructor(root, deps)` and `start(): Promise<void>` that renders the setup screen and manages transitions. `deps` injects the browser-bound pieces (`makeVideoRecorder`, `makeVoiceRecorder`, `audioSink`, `voiceStore`, `wakeGuard`, `rafLoop`) so a jsdom test can drive the flow without real media. The RAF loop is abstracted as `rafLoop: { start(cb: (deltaMs: number) => void): void; stop(): void }`.
  - Flow: setup → (Start) → request camera via `VideoRecorder.startCamera()`, attach stream to `TrainingView.videoEl`, start recording, acquire wake lock, build `CuePlayer` over the `VoiceStore`, create `SessionScheduler`, and pump it from `rafLoop`. Scheduler handlers call the cue player (`onDrillStart→announce`, `onEncourage→encourage`, `onCountdown→countdown`) and the training view setters. On `onSessionEnd` (or Stop): stop recording, release wake lock, stop RAF, build the object URL, show the done screen with stats. Download builds an `<a download>` with the blob URL and the recorder's extension. Restart returns to setup.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
// tests/karate/app.test.ts
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}
beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

it("runs setup → training → done when Start is pressed", async () => {
  const root = document.createElement("div");
  document.body.append(root);

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
    // tiny menu so the test is fast
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));       // camera promise
  expect(loopCb).toBeTypeOf("function");

  // pump 2s to finish the single drill → session end
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("[data-download]")).not.toBeNull();  // done screen showing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/app.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement app.ts + main.ts**

Implement `KarateApp` per the Interfaces block: wire setup/training/done/voice screens, the scheduler pumped by `rafLoop`, cue player over the voice store + audio sink, camera attach, wake lock, and download. `main.ts` constructs the real browser deps and calls `app.start()`:

```ts
// karate-trainer/src/main.ts
import { KarateApp } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { WakeGuard } from "./wake-lock";

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

const rafLoop = (() => {
  let raf = 0, last = 0;
  return {
    start(cb: (d: number) => void) {
      last = performance.now();
      const step = (t: number) => { cb(t - last); last = t; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(raf); },
  };
})();

await store.init();
const app = new KarateApp(root, {
  voiceStore: store,
  audioSink: new BrowserAudioSink(),
  makeVideoRecorder: () => new VideoRecorder(),
  makeVoiceRecorder: () => new VoiceRecorder(),
  wakeGuard: new WakeGuard(),
  rafLoop,
});
await app.start();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole karate suite + build**

Run: `npx vitest run tests/karate/` then `npm run build:karate`
Expected: all karate tests PASS; build produces `karate-trainer/dist`.

- [ ] **Step 6: Commit**

```bash
git add karate-trainer/src/main.ts karate-trainer/src/app.ts tests/karate/app.test.ts
git commit -m "feat(karate): wire full app (setup→training→done loop + voice)"
```

---

### Task 15: Polish styles + iPhone launch helper + manual test checklist

**Files:**
- Modify: `karate-trainer/style.css` (final portrait polish matching the mockup palette/tokens)
- Create: `karate-trainer/README.md` (how to run on iPhone + manual test checklist)

**Interfaces:**
- Consumes: everything.
- Produces: no new exports — visual polish + docs.

- [ ] **Step 1: Finalize the stylesheet**

Port the mockup's tokens (dojo-dark `--ground:#14110f`, `--tatami:#c9a45c`, `--obi:#c8402f`, off-white ink) and portrait layouts for all four screens: full-bleed mirrored video, oversized timer, safe-area padding (`env(safe-area-inset-bottom)`), thumb-zone controls, `prefers-reduced-motion` guard on the REC pulse/cue toast.

- [ ] **Step 2: Write the README (run + manual checklist)**

Document: `npm run dev:karate`, open `http://<mac-LAN-ip>:5273` in iPhone Safari (host is already exposed via `host:true`), grant camera/mic. Manual checklist:
  - [ ] Camera permission prompt appears; preview is mirrored.
  - [ ] Timer counts down; drill name + progress correct.
  - [ ] Cues play — beep/TTS with no recordings, your clips after recording.
  - [ ] Encouragement fires mid-drill, not during rests or the final 3s.
  - [ ] Auto-advance between drills; REC elapsed increases.
  - [ ] Screen stays awake during a session.
  - [ ] Stop → playback shows; `動画を保存` downloads a `.mp4`.
  - [ ] Record a voice clip → it plays during the next session → survives reload.
  - [ ] Export → clear Safari data → Import restores clips.
  - [ ] Menu edits persist across reload.

- [ ] **Step 3: Verify full test suite still green**

Run: `npm test`
Expected: the whole repo suite (Talk Quest + karate) passes.

- [ ] **Step 4: Commit**

```bash
git add karate-trainer/style.css karate-trainer/README.md
git commit -m "feat(karate): portrait polish + iPhone run guide and test checklist"
```

---

## Self-Review Notes

- **Spec coverage:** Setup/menu (T2,T10), Training/timer/cues (T3,T4,T5,T11), recording+mp4+mirroring (T6,T11,T12), Done/download (T12), in-app voice recording + IndexedDB + export/import + caveat (T7,T8,T13), fallback beep/TTS (T4,T5), wake lock (T9), iOS gesture/playsinline/mime rules (Global Constraints, T6,T11,T14), persistence (T2). All spec sections map to tasks.
- **Out of scope respected:** no coach-audio mixing, no per-drill cue assignment, no cloud TTS, no landscape.
- **Type consistency:** `CueRole` defined once (T4) and reused (T7,T13); `ClipSource.list` shape matches `VoiceStore.list` return; `SchedulerHandlers` names used identically in T3 and T14; recorder `fileExtension()` consumed in T12/T14.
