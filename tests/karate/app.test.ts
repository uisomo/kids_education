// @vitest-environment jsdom
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
    shareRecording: vi.fn().mockResolvedValue(undefined),
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
    // a longer drill so we can pause mid-way without ending the session
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 10, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));

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

it("passes the recorded blob to shareRecording after the parental gate", async () => {
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
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // done screen shown → press save → clear the parental gate → share fires
  const save = root.querySelector<HTMLButtonElement>("[data-download]")!;
  save.click();
  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  const q = root.querySelector<HTMLElement>("[data-gate-question]")!.textContent!;
  // parse "a + b = ?" and answer correctly
  const [a, b] = q.replace(/[^0-9+]/g, "").split("+").map(Number);
  input.value = String(a + b);
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();

  expect(shareRecording).toHaveBeenCalledOnce();
  expect(shareRecording.mock.calls[0][0]).toBe(recordedBlob);
  expect(shareRecording.mock.calls[0][1]).toBe("mp4");
});
