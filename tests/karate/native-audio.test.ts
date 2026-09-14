import { it, expect } from "vitest";
import { makeNativeBgm, playNativeClip } from "../../karate-trainer/src/native-audio";
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
