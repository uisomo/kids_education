// @vitest-environment jsdom
// The done screen plays the practice right away while the native save adds the
// overlay and sound; a video finished after the app was reopened is offered on
// the 今日の稽古 screen.
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";
import { openSavedVideoModal } from "../../karate-trainer/src/ui/saved-video-modal";

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

it("plays the capture at once, shows progress, then swaps in the finished video", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const done = deferred<{ playbackUrl: string; fileUri: string } | null>();
  let progress: ((f: number) => void) | null = null;
  const onShown = vi.fn();
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "raw.mov", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 0 },
    onShare, onAgain: vi.fn(), shareAllowed: true, onSend: vi.fn(),
    finishing: { done: done.promise, onProgress: (fn) => { progress = fn; }, onShown },
  });

  const video = root.querySelector("video")!;
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  const status = dl;   // the save button shows the progress until it's done
  const send = root.querySelector<HTMLButtonElement>("[data-share]")!;
  expect(video.getAttribute("src")).toBe("raw.mov");
  expect(status.textContent).toContain("0%");
  expect(dl.disabled).toBe(true);
  expect(send.disabled).toBe(true);

  progress!(0.42);
  expect(status.textContent).toContain("42%");

  done.resolve({ playbackUrl: "final.mp4", fileUri: "file:///final.mp4" });
  await tick();
  expect(video.getAttribute("src")).toBe("final.mp4");
  expect(root.querySelector("[data-finish-toast]")!.textContent).toContain("できたよ");
  expect(dl.textContent).toContain("動画を保存");
  expect(dl.hasAttribute("data-finish-status")).toBe(false);
  expect(dl.disabled).toBe(false);
  expect(send.disabled).toBe(false);
  expect(onShown).toHaveBeenCalledOnce();
  root.remove();
});

it("a screen already left doesn't mark the video as seen", async () => {
  const root = document.createElement("div");
  const onShown = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "raw.mov", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 0 },
    onShare: vi.fn(), onAgain: vi.fn(),
    finishing: { done: Promise.resolve({ playbackUrl: "f.mp4", fileUri: "file:///f.mp4" }), onProgress: () => {}, onShown },
  });
  await tick();
  expect(onShown).not.toHaveBeenCalled();   // root was never in the document
});

it("without a native save the done screen is unchanged", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 0 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("[data-finish-status]")).toBeNull();
  expect(root.querySelector<HTMLButtonElement>("[data-download]")!.disabled).toBe(false);
});

it("the 前回の動画 card shows a resumed save's progress, then the video", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const done = deferred<{ playbackUrl: string } | null>();
  let progress: ((f: number) => void) | null = null;
  const onShown = vi.fn();
  const onSave = vi.fn();
  openSavedVideoModal(host, {
    saving: { progress: 0.1, onProgress: (fn) => { progress = fn; }, done: done.promise },
    shareAllowed: false,
    onSave, onSend: vi.fn(), onShown, onClose: vi.fn(),
  });
  const title = host.querySelector("[data-saved-video-title]")!;
  expect(title.textContent).toContain("仕上げ中");
  expect(host.querySelector("[data-saved-video-status]")!.textContent).toBe("10%");
  progress!(0.5);
  expect(host.querySelector("[data-saved-video-status]")!.textContent).toBe("50%");
  expect(host.querySelector("[data-saved-video-send]")).toBeNull();

  done.resolve({ playbackUrl: "final.mp4" });
  await tick();
  expect(title.textContent).toContain("できたよ");
  expect(host.querySelector("video")!.getAttribute("src")).toBe("final.mp4");
  expect(onShown).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>("[data-saved-video-save]")!.click();
  expect(onSave).toHaveBeenCalledOnce();
  host.remove();
});

it("closing the card reports it and removes it", () => {
  const host = document.createElement("div");
  const onClose = vi.fn();
  openSavedVideoModal(host, {
    ready: { playbackUrl: "v.mp4" }, shareAllowed: true,
    onSave: vi.fn(), onSend: vi.fn(), onShown: vi.fn(), onClose,
  });
  expect(host.querySelector("[data-saved-video-send]")).not.toBeNull();
  host.querySelector<HTMLButtonElement>("[data-saved-video-close]")!.click();
  expect(onClose).toHaveBeenCalledOnce();
  expect(host.querySelector("[data-saved-video-modal]")).toBeNull();
});

it("the app offers a video that finished after it was reopened, once", async () => {
  const { KarateApp } = await import("../../karate-trainer/src/app");
  const { VoiceStore } = await import("../../karate-trainer/src/voice-store");
  const m = new Map<string, unknown>();
  const store = new VoiceStore({ get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] });
  await store.init();
  const kv = new Map<string, string>();
  const storage = {
    getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, String(v)),
    removeItem: (k: string) => void kv.delete(k), clear: () => kv.clear(), key: () => null, length: 0,
  } as Storage;
  const markSeen = vi.fn().mockResolvedValue(undefined);
  const root = document.createElement("div");
  document.body.append(root);
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn(), beep: vi.fn(), speak: vi.fn() } as never,
    makeVideoRecorder: () => { throw new Error("unused"); },
    makeVoiceRecorder: () => { throw new Error("unused"); },
    wakeGuard: { acquire: vi.fn(), release: vi.fn() } as never,
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    savedVideos: {
      status: async () => ({ saving: null, unseen: [{ jobId: "j1", uri: "file:///tmp/j1.mp4", createdAt: 1 }] }),
      watch: vi.fn(),
      markSeen,
      playbackUrl: (uri) => `web:${uri}`,
    },
  });
  await app.start();
  for (let i = 0; i < 3; i++) await tick();

  const modal = document.querySelector("[data-saved-video-modal]")!;
  expect(modal).not.toBeNull();
  expect(modal.querySelector("video")!.getAttribute("src")).toBe("web:file:///tmp/j1.mp4");
  expect(markSeen).toHaveBeenCalledWith("j1");
  modal.querySelector<HTMLButtonElement>("[data-saved-video-close]")!.click();
  expect(document.querySelector("[data-saved-video-modal]")).toBeNull();
  root.remove();
});
