// 練習BGM は イヤフォンをつけているときだけ流れる（karate-trainer/src/bgm-gate.ts）。
//
// 大事なのは「子どもが選んだ on/off を こわさない」こと。イヤフォンを抜いている
// あいだは鳴らないが、さし直したら 子どもの選んだとおりに戻る。
import { describe, expect, it } from "vitest";
import {
  alwaysConnected,
  withHeadphoneGate,
  type HeadphoneWatcher,
} from "../../karate-trainer/src/bgm-gate";
import type { BgmPlayer } from "../../karate-trainer/src/app";

function fakePlayer(): BgmPlayer & { muted: boolean; plays: number; stops: number } {
  return {
    src: "/characters/one-more-rounds.m4a",
    muted: false,
    plays: 0,
    stops: 0,
    unlock() { /* nothing to prime in a test */ },
    play() { this.plays++; },
    stop() { this.stops++; },
    setMuted(next: boolean) { this.muted = next; },
    isMuted() { return this.muted; },
  };
}

function fakeWatcher(connected: boolean) {
  const listeners: ((c: boolean) => void)[] = [];
  return {
    watcher: {
      connected: () => connected,
      onChange(cb: (c: boolean) => void) {
        listeners.push(cb);
        return () => { /* not exercised here */ };
      },
    } as HeadphoneWatcher,
    set(next: boolean) {
      connected = next;
      listeners.forEach((cb) => cb(next));
    },
  };
}

describe("BGM のイヤフォンゲート", () => {
  it("イヤフォンが無ければ、中の player は鳴らないようにされる", () => {
    const player = fakePlayer();
    const bgm = withHeadphoneGate(player, fakeWatcher(false).watcher);
    expect(player.muted).toBe(true);
    expect(bgm.isMuted()).toBe(true);
    expect(bgm.mutedByHeadphones()).toBe(true);
  });

  it("イヤフォンがあれば、子どもの選んだとおりに鳴る", () => {
    const player = fakePlayer();
    const bgm = withHeadphoneGate(player, fakeWatcher(true).watcher);
    expect(player.muted).toBe(false);
    expect(bgm.isMuted()).toBe(false);
    expect(bgm.mutedByHeadphones()).toBe(false);
  });

  it("さした瞬間に鳴りはじめ、抜いた瞬間に止まる", () => {
    const player = fakePlayer();
    const hp = fakeWatcher(false);
    const bgm = withHeadphoneGate(player, hp.watcher);
    expect(player.muted).toBe(true);

    hp.set(true);
    expect(player.muted).toBe(false);
    expect(bgm.isMuted()).toBe(false);

    hp.set(false);
    expect(player.muted).toBe(true);
    expect(bgm.isMuted()).toBe(true);
  });

  it("子どもが「切」にしていれば、イヤフォンをさしても鳴らない", () => {
    const player = fakePlayer();
    const hp = fakeWatcher(false);
    const bgm = withHeadphoneGate(player, hp.watcher);
    bgm.setMuted(true);

    hp.set(true);
    expect(player.muted).toBe(true);
    expect(bgm.isMuted()).toBe(true);
    // 鳴らない理由は イヤフォンではなく 子どもの設定。
    expect(bgm.mutedByHeadphones()).toBe(false);
  });

  it("イヤフォンを抜いているあいだの on/off は覚えていて、さしたら効く", () => {
    const player = fakePlayer();
    const hp = fakeWatcher(false);
    const bgm = withHeadphoneGate(player, hp.watcher);

    bgm.setMuted(true);   // 抜いているあいだに「切」
    bgm.setMuted(false);  // やっぱり「入」
    expect(player.muted).toBe(true);   // まだ鳴らない（イヤフォンが無い）

    hp.set(true);
    expect(player.muted).toBe(false);  // さしたら「入」が生きる
  });

  it("onHeadphoneChange は イヤフォンの出入りだけを知らせる", () => {
    const player = fakePlayer();
    const hp = fakeWatcher(false);
    const bgm = withHeadphoneGate(player, hp.watcher);
    const heard: boolean[] = [];
    bgm.onHeadphoneChange((audible) => heard.push(audible));

    hp.set(true);
    hp.set(false);
    expect(heard).toEqual([true, false]);

    // 子どもが「切」にしたあとは、さしても抜いても鳴らないので知らせない
    // （保存する動画の音の記録を二重に書かないため）。
    bgm.setMuted(true);
    heard.length = 0;
    hp.set(true);
    hp.set(false);
    expect(heard).toEqual([]);
  });

  it("購読はやめられる", () => {
    const player = fakePlayer();
    const hp = fakeWatcher(false);
    const bgm = withHeadphoneGate(player, hp.watcher);
    const heard: boolean[] = [];
    const off = bgm.onHeadphoneChange((audible) => heard.push(audible));
    off();
    hp.set(true);
    expect(heard).toEqual([]);
  });

  it("play() のたびに出口を読み直す（イベントを取りこぼしても正しくなる）", () => {
    const player = fakePlayer();
    let connected = false;
    const bgm = withHeadphoneGate(player, {
      connected: () => connected,
      onChange: () => () => { /* イベントは来ないことにする */ },
    });
    expect(player.muted).toBe(true);

    connected = true;          // 知らないうちに さされた
    bgm.play();
    expect(player.muted).toBe(false);
    expect(player.plays).toBe(1);
  });

  it("src と stop() はそのまま通る（保存する動画が同じ曲を混ぜられるように）", () => {
    const player = fakePlayer();
    const bgm = withHeadphoneGate(player, alwaysConnected);
    expect(bgm.src).toBe("/characters/one-more-rounds.m4a");
    bgm.stop();
    expect(player.stops).toBe(1);
  });

  it("ブラウザ（出口が読めない）ではこれまでどおり鳴る", () => {
    const player = fakePlayer();
    const bgm = withHeadphoneGate(player, alwaysConnected);
    expect(bgm.isMuted()).toBe(false);
    expect(bgm.mutedByHeadphones()).toBe(false);
  });
});
