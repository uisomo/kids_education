// @vitest-environment jsdom
// Ready → 3 → 2 → 1 → Go!!: 「よーい」 is spoken, 3 / 2 / 1 play 「ぷっ」 and Go!!
// a long 「ぷーん」, logged so the native export mixes them into the video.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { COUNTDOWN_SOUNDS } from "../../karate-trainer/src/ui/countdown-intro";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

beforeEach(() => {
  document.body.textContent = "";
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

async function runSession(playEffect?: (src: string) => void) {
  const root = document.createElement("div");
  document.body.append(root);
  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const audioSink = { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) };
  const stop = vi.fn().mockResolvedValue(new Blob(["v"]));
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink,
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop,
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 1, kind: "drill" }],
    playEffect,
  });
  await app.start();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // The intro is over; later beeps belong to the drill's own countdown.
  const introBeeps = audioSink.beep.mock.calls.length;
  for (let t = 0; t < 1500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));
  return { audioSink, stop, introBeeps };
}

it("3 / 2 / 1 go ぷっ and Go!! goes ぷーん, and the saved video gets them", async () => {
  const playEffect = vi.fn();
  const { audioSink, stop, introBeeps } = await runSession(playEffect);

  expect(audioSink.speak).toHaveBeenCalledWith("よーい");
  expect(audioSink.speak).not.toHaveBeenCalledWith("はじめ");
  expect(introBeeps).toBe(0);
  expect(playEffect.mock.calls.map(([src]) => src)).toEqual([
    COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.go,
  ]);

  const sounds = stop.mock.calls[0][3] as { kind: string; src?: string; t: number }[];
  const clips = sounds.filter((s) => s.kind === "clip").map((s) => s.src);
  expect(clips.slice(0, 4)).toEqual([COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.tick, COUNTDOWN_SOUNDS.go]);
});

it("without an effect player the countdown still beeps", async () => {
  const { introBeeps } = await runSession();
  expect(introBeeps).toBe(4);
});
