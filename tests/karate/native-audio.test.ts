import { it, expect } from "vitest";
import { makeNativeBgm, makeNativeHeadphoneWatcher, playNativeClip } from "../../karate-trainer/src/native-audio";
import type { KarateRecorderPluginLike } from "../../karate-trainer/src/native-recorder";

function fakePlugin() {
  const calls: string[] = [];
  const plugin: KarateRecorderPluginLike = {
    async startPreview() {},
    async stopPreview() {},
    async startRecording() {},
    async stopRecording() { return { uri: "", burnedIn: false }; },
    async playMusic(o: { src: string; volume: number }) { calls.push(`play ${o.src} ${o.volume}`); },
    async setMusicPaused(o: { paused: boolean }) { calls.push(o.paused ? "pause" : "resume"); },
    async stopMusic() { calls.push("stop"); },
    async playClip(o: { src: string; volume: number }) { calls.push(`clip ${o.src} ${o.volume}`); },
  };
  return { plugin, calls };
}

it("plays, pauses, resumes and stops music through the native engine", () => {
  const { plugin, calls } = fakePlugin();
  const bgm = makeNativeBgm("/m.mp3", 0.2, plugin);
  bgm.play();
  bgm.setMuted(true);
  bgm.setMuted(false);
  bgm.stop();
  expect(calls).toEqual(["play /m.mp3 0.2", "pause", "resume", "stop"]);
  expect(bgm.src).toBe("/m.mp3");
});

it("starts the music on unmute when the session began muted", () => {
  const { plugin, calls } = fakePlugin();
  const bgm = makeNativeBgm("/m.mp3", 0.2, plugin);
  bgm.setMuted(true);
  bgm.play();
  expect(calls).toEqual([]);
  bgm.setMuted(false);
  expect(calls).toEqual(["play /m.mp3 0.2"]);
});

it("ignores mute changes outside a session", () => {
  const { plugin, calls } = fakePlugin();
  const bgm = makeNativeBgm("/m.mp3", 0.2, plugin);
  bgm.setMuted(true);
  bgm.setMuted(false);
  expect(calls).toEqual([]);
  expect(bgm.isMuted()).toBe(false);
});

it("sends cheer voices to the native engine", () => {
  const { plugin, calls } = fakePlugin();
  playNativeClip("/characters/cheer/leo-2.m4a", 0.9, plugin);
  expect(calls).toEqual(["clip /characters/cheer/leo-2.m4a 0.9"]);
});

// イヤフォンの見張り（makeNativeHeadphoneWatcher）。native の audioRoute() を
// 一度読み、あとは "audioRouteChanged" で追いかける。
it("読めるまでは「イヤフォン無し」— 分からないうちにスピーカーから鳴らさない", () => {
  const { plugin } = fakePlugin();
  const watcher = makeNativeHeadphoneWatcher({
    ...plugin,
    async audioRoute() { return { headphones: true }; },
  });
  // まだ await していないので false のまま。
  expect(watcher.connected()).toBe(false);
});

it("audioRoute() の答えでつながる", async () => {
  const { plugin } = fakePlugin();
  const watcher = makeNativeHeadphoneWatcher({
    ...plugin,
    async audioRoute() { return { headphones: true }; },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(watcher.connected()).toBe(true);
});

it("audioRouteChanged で 出入りを追いかけ、変わったときだけ知らせる", async () => {
  const { plugin } = fakePlugin();
  let fire: ((d: { headphones?: boolean }) => void) | undefined;
  const watcher = makeNativeHeadphoneWatcher({
    ...plugin,
    async audioRoute() { return { headphones: false }; },
    async addListener(_name: string, cb: (d: { headphones?: boolean }) => void) {
      fire = cb;
      return { remove: async () => {} };
    },
  } as unknown as KarateRecorderPluginLike);
  await new Promise((r) => setTimeout(r, 0));

  const seen: boolean[] = [];
  watcher.onChange((c) => seen.push(c));
  fire!({ headphones: true });
  fire!({ headphones: true });   // 同じ状態は知らせない
  fire!({ headphones: false });
  expect(seen).toEqual([true, false]);
  expect(watcher.connected()).toBe(false);
});

it("audioRoute() の無い古い native ビルドでは、これまでどおり流す", () => {
  const { plugin } = fakePlugin();
  const watcher = makeNativeHeadphoneWatcher(plugin);
  expect(watcher.connected()).toBe(true);
});
