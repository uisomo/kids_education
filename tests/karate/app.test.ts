// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId, loadMembers } from "../../karate-trainer/src/member-store";
import { loadPlan } from "../../karate-trainer/src/plan-store";
import { addKufu, loadKufu, latestKufu } from "../../karate-trainer/src/kufu-store";
import { loadBelt } from "../../karate-trainer/src/belt-store";
import { countFor } from "../../karate-trainer/src/progress-store";
import { savePreset } from "../../karate-trainer/src/preset-store";
import { loadMenuBelt, beltStateFor, setSelectedPreset } from "../../karate-trainer/src/menu-belt-store";

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
    shareRecording: vi.fn().mockResolvedValue(undefined),
    introStepMs: 0,   // skip the Ready→Go intro delay in tests
    // tiny menu so the test is fast
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));       // camera promise
  await new Promise((r) => setTimeout(r, 0));       // intro promise
  expect(loopCb).toBeTypeOf("function");

  // pump 2s to finish the single drill → session end
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("[data-download]")).not.toBeNull();  // done screen showing
});

it("returns to setup with a message when the camera is denied", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);

  const store = new VoiceStore(memKv());
  await store.init();

  const wakeGuard = { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const rafStart = vi.fn();

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockRejectedValue(new Error("denied")),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard,
    rafLoop: { start: rafStart, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  // let the rejected camera promise settle
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Back on setup, NOT stuck on a broken training screen.
  expect(root.querySelector("[data-start]")).not.toBeNull();
  expect(root.querySelector("[data-rows]")).not.toBeNull();
  expect(root.querySelector("[data-stop]")).toBeNull();       // no training controls
  expect(root.querySelector("[data-setup-status]")).not.toBeNull(); // message surfaced

  // Loop never started; a half-acquired wake lock is never left dangling.
  expect(rafStart).not.toHaveBeenCalled();

  await new Promise((r) => setTimeout(r, 0));
  expect(unhandled).not.toHaveBeenCalled();
  process.off("unhandledRejection", unhandled);
});

it("pause freezes the countdown and a second click resumes it", async () => {
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
    shareRecording: vi.fn().mockResolvedValue(undefined),
    introStepMs: 0,   // skip the Ready→Go intro delay in tests
    // a longer drill so we can pause mid-way without ending the session
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 10, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));   // intro promise

  const timer = () => root.querySelector<HTMLElement>("[data-timer]")!.textContent;
  const pauseBtn = () => root.querySelector<HTMLButtonElement>("[data-pause]")!;

  // pump 3s → 10 - 3 = 7 left
  for (let t = 0; t < 3000; t += 250) loopCb!(250);
  expect(timer()).toBe("7");
  expect(pauseBtn().textContent).toContain("一時停止");

  // pause → label flips, countdown frozen
  pauseBtn().click();
  expect(pauseBtn().textContent).toContain("再開");
  const frozen = timer();
  for (let t = 0; t < 2000; t += 250) loopCb!(250);
  expect(timer()).toBe(frozen);   // scheduler.pause() held it

  // resume → label flips back, countdown advances again
  pauseBtn().click();
  expect(pauseBtn().textContent).toContain("一時停止");
  for (let t = 0; t < 2000; t += 250) loopCb!(250);
  expect(Number(timer())).toBeLessThan(Number(frozen));  // scheduler.resume() path exercised
});

it("TEXT-mode drill reveals words one by one, hides the timer, and logs texts for burn-in", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const burnOverlay = vi.fn().mockResolvedValue(null);

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
    burnOverlay,
    introStepMs: 0,
    // 4 words over 8s → one reveals every 2s (first immediately at drill start)
    menuOverride: [{ id: "a", name: "平安初段", seconds: 8, kind: "drill", timerMode: "text", texts: "いち に さん\nし" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));   // intro promise

  const shown = () => root.querySelectorAll(".text-grid-word.show").length;

  // Timer hidden, hint + grid visible, first word revealed at drill start.
  expect(root.querySelector<HTMLElement>("[data-timer]")!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>("[data-read-hint]")!.hidden).toBe(false);
  expect(root.querySelectorAll(".text-grid-word").length).toBe(4);
  expect(shown()).toBe(1);

  for (let t = 0; t < 2000; t += 250) loopCb!(250);   // 2s in → 2nd word
  expect(shown()).toBe(2);
  for (let t = 0; t < 2000; t += 250) loopCb!(250);   // 4s in → 3rd word
  expect(shown()).toBe(3);
  for (let t = 0; t < 4500; t += 250) loopCb!(250);   // run out the drill
  await new Promise((r) => setTimeout(r, 0));

  // Burn-in got the revealed words (line layout preserved) but no countdown.
  const events = burnOverlay.mock.calls[0][1] as { patch: { texts?: string[][]; seconds?: number } }[];
  const textPatches = events.filter((e) => e.patch.texts?.length);
  expect(textPatches.at(-1)!.patch.texts).toEqual([["いち", "に", "さん"], ["し"]]);
  expect(events.some((e) => (e.patch.seconds ?? 0) > 0)).toBe(false);
});

it("passes the recorded blob to shareRecording when save is pressed", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const shareRecording = vi.fn().mockResolvedValue(undefined);
  const recordedBlob = new Blob(["v"]);

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(recordedBlob),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording,
    askParentalGate: vi.fn().mockResolvedValue(true),   // the parent passes the gate
    introStepMs: 0,   // skip the Ready→Go intro delay in tests
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));   // intro promise
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // done screen shown → press save → parental gate → share sheet
  const save = root.querySelector<HTMLButtonElement>("[data-download]")!;
  save.click();
  await new Promise((r) => setTimeout(r, 0));

  expect(shareRecording).toHaveBeenCalledOnce();
  expect(shareRecording.mock.calls[0][0]).toBe(recordedBlob);
  expect(shareRecording.mock.calls[0][1]).toBe("mp4");
});

it("plays BGM after the intro and stops it when the session ends", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const bgm = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), setMuted: vi.fn(), isMuted: vi.fn(() => false) };

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
    bgm,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  // BGM must not start before the intro finishes, but IS unlocked on the tap.
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  expect(bgm.unlock).toHaveBeenCalledOnce();   // synchronous, inside the gesture
  expect(bgm.play).not.toHaveBeenCalled();     // not yet — intro still running
  await new Promise((r) => setTimeout(r, 0));   // camera
  await new Promise((r) => setTimeout(r, 0));   // intro → Go!! → bgm.play
  expect(bgm.play).toHaveBeenCalledOnce();
  expect(bgm.stop).not.toHaveBeenCalled();

  // run the drill to completion → session end → bgm stops
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));
  expect(bgm.stop).toHaveBeenCalled();
});

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

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}

it("a finished practice on a saved menu levels its drills up and the 強さ tab shows them", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  const kihon = [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" as const }];
  const preset = savePreset("基本", kihon, storage)!;
  setSelectedPreset(preset.id, scopedStorage(storage, getActiveId(storage)));

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
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  // setup shows the bottom nav
  expect(root.querySelector("[data-bottom-nav]")).not.toBeNull();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // back to setup via もう一度, then open 強さ
  root.querySelector<HTMLButtonElement>("[data-again]")!.click();
  root.querySelector<HTMLButtonElement>('[data-navtab="strength"]')!.click();

  const row = root.querySelector('[data-strength-row="前蹴り"]');
  expect(row).not.toBeNull();
  expect(root.querySelector('[data-strength-level="前蹴り"]')!.textContent).toBe("Lv.1");
  expect(row!.querySelectorAll(".strength-bar.lit").length).toBe(1);

  // Its only drill is at Lv.1, so the menu's belt shows one bar.
  const mem = scopedStorage(storage, getActiveId(storage));
  expect(beltStateFor(loadMenuBelt(preset.id, mem), kihon)).toEqual({ index: 0, bars: 1 });
});

// Stopping with 終了 keeps the video but must not count toward 強さ or the belt.
it("stopping partway with 終了 adds no 強さ count and no belt bar", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();

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
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 3000; t += 250) loopCb!(250);   // partway through the 30s drill

  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("[data-download]")).not.toBeNull();   // video still saved
  expect(root.querySelector("[data-belt-result]")!.textContent).toContain("ふえない");
  const mem = scopedStorage(storage, getActiveId(storage));
  expect(countFor("前蹴り", mem)).toBe(0);
  expect(loadBelt(mem)).toEqual({ index: 0, bars: 0 });
});

it("recovers to a visible screen instead of hanging when 終了 hits a recorder error", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      // Simulates MediaRecorder.stop() rejecting/throwing (e.g. an already-inactive
      // recorder) — the failure mode that left 終了 doing nothing but freezing.
      stop: vi.fn().mockRejectedValue(new Error("recorder already inactive")),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    introStepMs: 0,
    // long drill so the session is still active (not near natural end) when 終了 is clicked
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));   // intro promise
  expect(loopCb).toBeTypeOf("function");

  for (let t = 0; t < 3000; t += 250) loopCb!(250);   // some active recording time

  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Not stuck on the training screen — recovered to a visible screen.
  expect(root.querySelector("[data-stop]")).toBeNull();
  expect(root.querySelector("[data-setup-status]")).not.toBeNull();

  await new Promise((r) => setTimeout(r, 0));
  expect(unhandled).not.toHaveBeenCalled();
  process.off("unhandledRejection", unhandled);
});

// Household plan: Free/Premium allow 1 kid, Family allows 5. Dropping below the
// member count locks the extra kids (kept, not deleted) and keeps the active
// kid inside the limit.
it("plan kid limits: Family unlocks siblings; downgrading locks them without deleting", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const m = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
  const first = getActiveId(storage);

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
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();
  const card = (plan: string) => root.querySelector<HTMLButtonElement>(`[data-plan-card="${plan}"]`)!;

  // 家族 tab → pass the parental gate.
  root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  const [a, b] = root.querySelector("[data-gate-question]")!.textContent!.match(/\d+/g)!.map(Number);
  root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(a * b);
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();

  // Free: 1 kid, so adding is off.
  expect(root.querySelector<HTMLButtonElement>("[data-member-add]")!.disabled).toBe(true);

  // Family: add たろう (adding makes them active).
  card("family").click();
  expect(loadPlan(storage)).toBe("family");
  root.querySelector<HTMLInputElement>("[data-member-add-input]")!.value = "たろう";
  root.querySelector<HTMLButtonElement>("[data-member-add]")!.click();
  const taro = loadMembers(storage).find((x) => x.name === "たろう")!.id;
  expect(getActiveId(storage)).toBe(taro);

  // たろう saves 3 工夫 across two 種目.
  const taroS = scopedStorage(storage, taro);
  addKufu("前蹴り", "ひざ", taroS);
  addKufu("前蹴り", "こし", taroS);
  addKufu("正拳突き", "ひき", taroS);
  const kufuCount = () => loadKufu("前蹴り", taroS).length + loadKufu("正拳突き", taroS).length;

  // Premium: back to 1 kid. たろう is locked but kept; じぶん becomes active.
  card("premium").click();
  expect(loadMembers(storage)).toHaveLength(2);
  expect(getActiveId(storage)).toBe(first);
  expect(root.querySelector(`[data-member-row="${taro}"]`)!.classList.contains("locked")).toBe(true);
  expect(kufuCount()).toBe(3);   // Premium keeps them all

  // The practice screen only offers usable kids.
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  expect(root.querySelectorAll("[data-member]")).toHaveLength(1);

  // Free locks 工夫 past 1 種目 — nothing is deleted, so upgrading brings it back.
  root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  const [c, d] = root.querySelector("[data-gate-question]")!.textContent!.match(/\d+/g)!.map(Number);
  root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(c * d);   // leaving 家族 re-locked the gate
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
  card("free").click();
  expect(kufuCount()).toBe(3);
  expect(latestKufu("正拳突き", taroS, { perDrill: 1, total: 1 })).toBe("");
});
