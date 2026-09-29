// @vitest-environment jsdom
// Live headphone monitoring must never change the chosen movie soundtrack.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { withHeadphoneGate, type HeadphoneWatcher } from "../../karate-trainer/src/bgm-gate";
import { addKufu } from "../../karate-trainer/src/kufu-store";
import { setPlan } from "../../karate-trainer/src/plan-store";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import type { BgmPlayer } from "../../karate-trainer/src/app";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

beforeEach(() => {
  document.body.textContent = "";
  localStorage.clear();
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

function fakePlayer(): BgmPlayer & { muted: boolean } {
  return {
    src: "/characters/one-more-rounds.m4a",
    muted: false,
    unlock() {},
    play() {},
    stop() {},
    setMuted(next: boolean) { this.muted = next; },
    isMuted() { return this.muted; },
  };
}

/// イヤフォンの状態を外から動かせる見張り。
function watcher(connected: boolean) {
  const listeners: ((c: boolean) => void)[] = [];
  return {
    hp: {
      connected: () => connected,
      onChange(cb: (c: boolean) => void) { listeners.push(cb); return () => {}; },
    } as HeadphoneWatcher,
    set(next: boolean) { connected = next; listeners.forEach((cb) => cb(next)); },
  };
}

async function runSession(headphones: boolean) {
  const root = document.createElement("div");
  document.body.append(root);
  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const stop = vi.fn().mockResolvedValue(new Blob(["v"]));
  const hp = watcher(headphones);
  const bgm = withHeadphoneGate(fakePlayer(), hp.hp);
  setPlan("suite");
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
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
    bgm,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 15, kind: "drill" }],
  });
  await app.start();
  const member = scopedStorage(localStorage, getActiveId());
  for (const note of ["ひざを上げる", "目を見る", "手をもどす"]) addKufu("前蹴り", note, member);
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));   // camera
  await new Promise((r) => setTimeout(r, 0));   // intro → Go!!
  return {
    root, stop, hp, bgm,
    tick() { loopCb!(1000); },
    async finish() {
      for (let t = 0; t < 15500; t += 250) loopCb!(250);
      await new Promise((r) => setTimeout(r, 0));
      return (stop.mock.calls[0][3] ?? []) as { kind: string; playing?: boolean; t: number }[];
    },
  };
}

it("3つの工夫を全件・個別で表示し、同じ内容を動画へ記録する", async () => {
  const s = await runSession(false);
  const caption = () => s.root.querySelector("[data-caption]")?.textContent ?? "";
  const notes = ["ひざを上げる", "目を見る", "手をもどす"];
  notes.forEach((note) => expect(caption()).toContain(note));
  const seen = new Set<string>();
  for (let t = 0; t < 12; t++) { s.tick(); seen.add(caption()); }
  for (const note of notes) expect([...seen].some((text) => text.includes(note) && !text.includes("\n"))).toBe(true);
  await s.finish();
  const events = s.stop.mock.calls[0][0] as { patch: { caption?: string } }[];
  const recorded = events.map((e) => e.patch.caption).filter((s): s is string => !!s);
  expect(recorded.some((text) => notes.every((note) => text.includes(note)))).toBe(true);
  for (const note of notes) expect(recorded.some((text) => text.includes(note) && !text.includes("\n"))).toBe(true);
});
