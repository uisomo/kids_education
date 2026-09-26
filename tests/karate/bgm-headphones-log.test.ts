// @vitest-environment jsdom
// 保存する動画には「鳴った音」だけを記録する。
//
// 練習BGM は イヤフォンをつけているときだけ鳴る。イヤフォンが無いまま BGM を
// 「入」にしても鳴らないので、そのとき音の記録に playing: true を書いてしまうと、
// **鳴っていなかった音楽が 保存する動画に混ざる**（SoundMixer は この記録を見て
// 曲を混ぜる）。そこを固定するテスト。
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { withHeadphoneGate, type HeadphoneWatcher } from "../../karate-trainer/src/bgm-gate";
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
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 3, kind: "drill" }],
  });
  await app.start();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));   // camera
  await new Promise((r) => setTimeout(r, 0));   // intro → Go!!
  return {
    root, stop, hp, bgm,
    async finish() {
      for (let t = 0; t < 3500; t += 250) loopCb!(250);
      await new Promise((r) => setTimeout(r, 0));
      return (stop.mock.calls[0][3] ?? []) as { kind: string; playing?: boolean; t: number }[];
    },
  };
}

const bgmEvents = (sounds: { kind: string; playing?: boolean }[]) =>
  sounds.filter((s) => s.kind === "bgm").map((s) => s.playing);

it("イヤフォンが無ければ、稽古のはじめから「鳴っていない」と記録する", async () => {
  const s = await runSession(false);
  const sounds = await s.finish();
  // 最初の記録が false（鳴っていない）で、true は一度も出てこない。
  expect(bgmEvents(sounds)[0]).toBe(false);
  expect(bgmEvents(sounds)).not.toContain(true);
});

it("イヤフォンがあれば、これまでどおり「鳴っている」と記録する", async () => {
  const s = await runSession(true);
  const sounds = await s.finish();
  expect(bgmEvents(sounds)[0]).toBe(true);
});

it("イヤフォン無しで BGM を「入」に押しても、鳴っていないと記録する", async () => {
  const s = await runSession(false);
  const btn = s.root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!;
  // いまは「切」の状態（bgm-store は空 = 入 なので、1回目の押しで「切」になる）。
  btn.click();   // 切
  btn.click();   // 入 ← イヤフォンが無いので鳴らない
  const sounds = await s.finish();
  expect(bgmEvents(sounds)).not.toContain(true);
  // 中の player も鳴らされていない。
  expect(s.bgm.isMuted()).toBe(true);
});

it("稽古のとちゅうでイヤフォンを抜いたら、そこから「鳴っていない」と記録する", async () => {
  const s = await runSession(true);
  expect(s.bgm.isMuted()).toBe(false);
  s.hp.set(false);                       // 抜いた
  expect(s.bgm.isMuted()).toBe(true);
  const sounds = await s.finish();
  const events = bgmEvents(sounds);
  expect(events[0]).toBe(true);          // はじめは鳴っていた
  expect(events).toContain(false);       // 抜いたところで止まった
});
