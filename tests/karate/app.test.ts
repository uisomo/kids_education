// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { saveComment } from "../../karate-trainer/src/comment-store";

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
    introStepMs: 0,   // skip the Ready→Go intro delay in tests
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));   // intro promise
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // done screen shown → press save → share fires directly (kids save their own video)
  const save = root.querySelector<HTMLButtonElement>("[data-download]")!;
  save.click();

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

  const bgm = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() };

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

it("the training screen's BGM button toggles bgm.setMuted", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  const store = new VoiceStore(memKv());
  await store.init();

  const bgm = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() };

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
    bgm,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  const btn = root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!;
  btn.click();
  expect(bgm.setMuted).toHaveBeenCalledWith(true);
  expect(btn.textContent).toBe("🔇");

  btn.click();
  expect(bgm.setMuted).toHaveBeenCalledWith(false);
  expect(btn.textContent).toBe("🎵");
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

// E4: when the parent has written a ファイト コメント for the active member, the
// in-practice encourage cue uses it (and burns it into the recording) instead
// of the generic "ファイト！" toast.
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

it("bumps 強さ counts on session complete and the 強さ tab shows them", async () => {
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
  expect(root.querySelector('[data-strength-level="前蹴り"]')!.textContent).toBe("Lv.0");
  expect(row!.querySelectorAll(".strength-bar.lit").length).toBe(1);
});
