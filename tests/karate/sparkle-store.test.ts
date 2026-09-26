// @vitest-environment jsdom
// ✨キラキラ を あつめる決まり。ここが狂うと「がんばったのに何ももらえない」／
// 「一気に全部もらえる」のどちらかになる。
//
// いまの決まり: **帯を 5本もらうごとに 1つ**（カタログの順に）。
import { it, expect, beforeEach } from "vitest";
import {
  MY_SPARKLES, loadUnlocked, setUnlocked, nextToUnlock, earnedCount, BELTS_PER_SPARKLE,
  SPARKLES_PER_STEP, BELTS_STEP_UP, beltsForSparkle, beltsNeededFor, beltsToOwn,
} from "../../karate-trainer/src/sparkle-store";
import { earnBelt, setEarnedBelts } from "../../karate-trainer/src/belt-collection-store";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const starters = MY_SPARKLES.filter((s) => s.tier === "start").map((s) => s.id);
let store: Storage;
beforeEach(() => { store = memStorage(); });

/// 帯を n 本もらう（色は白でよい: 決まりは本数だけを見る）。
function earn(n: number): void {
  for (let i = 0; i < n; i++) earnBelt(0, store);
}

it("最初は はじめから持っているものだけ", () => {
  expect(loadUnlocked(store)).toEqual(starters);
  expect(earnedCount(store)).toBe(0);
});

it(`${BELTS_PER_SPARKLE}本めの帯で 1つ開く（4本では まだ開かない）`, () => {
  earn(BELTS_PER_SPARKLE - 1);
  expect(loadUnlocked(store)).toEqual(starters);
  earn(1);
  expect(loadUnlocked(store).length).toBe(starters.length + 1);
});

it("帯 10本で 2つ、15本で 3つ —— 一気には開かない", () => {
  earn(10);
  expect(earnedCount(store)).toBe(2);
  earn(5);
  expect(earnedCount(store)).toBe(3);
});

// --- ハードルは 8つごとに 3本ずつ上がる（5本ずつ → 8本ずつ → 11本ずつ …）---

it("はじめの8つは 5本ずつ、つぎの8つは 8本ずつ", () => {
  expect(beltsForSparkle(1)).toBe(5);
  expect(beltsForSparkle(SPARKLES_PER_STEP)).toBe(5);
  expect(beltsForSparkle(SPARKLES_PER_STEP + 1)).toBe(5 + BELTS_STEP_UP);
  expect(beltsForSparkle(SPARKLES_PER_STEP * 2 + 1)).toBe(5 + BELTS_STEP_UP * 2);
  // のべ: 8つめ=40本、9つめ=48本、16こめ=104本。
  expect(beltsNeededFor(8)).toBe(40);
  expect(beltsNeededFor(9)).toBe(48);
  expect(beltsNeededFor(16)).toBe(104);
});

it("8つめのあとは 5本では開かない（つぎは8本）", () => {
  earn(40);
  expect(earnedCount(store)).toBe(8);
  earn(5);
  expect(earnedCount(store)).toBe(8);       // まだ足りない
  expect(nextToUnlock(store)?.remaining).toBe(3);
  earn(3);
  expect(earnedCount(store)).toBe(9);
});

it("まだ持っていない1つに、のべ何本 要るかが分かる", () => {
  const earned = MY_SPARKLES.filter((s) => s.tier !== "start");
  expect(beltsToOwn(earned[0].id)).toBe(5);
  expect(beltsToOwn(earned[8].id)).toBe(48);
  expect(beltsToOwn(MY_SPARKLES.find((s) => s.tier === "start")!.id)).toBeNull();
});

it("開く順は カタログの順（start のつぎから）", () => {
  const earnedOrder = MY_SPARKLES.filter((s) => s.tier !== "start").map((s) => s.id);
  earn(BELTS_PER_SPARKLE);
  const have = loadUnlocked(store);
  expect(have).toContain(earnedOrder[0]);
  expect(have).not.toContain(earnedOrder[1]);
});

it("つぎの1つと、あと何本の帯で開くかを返す", () => {
  expect(nextToUnlock(store)?.remaining).toBe(BELTS_PER_SPARKLE);
  earn(3);
  expect(nextToUnlock(store)?.remaining).toBe(BELTS_PER_SPARKLE - 3);
});

it("帯をぜんぶ集めても、キラキラの数をこえて開かない", () => {
  setEarnedBelts(Array.from({ length: 999 }, () => 0), store);
  expect(loadUnlocked(store)).toEqual(MY_SPARKLES.map((s) => s.id));
});

it("古い決まりで開けたものは 取り上げない", () => {
  // 帯が 0本でも、保存に残っている id はそのまま持っている。
  const old = MY_SPARKLES.filter((s) => s.tier !== "start")[3];
  setUnlocked([old.id], store);
  expect(loadUnlocked(store)).toContain(old.id);
  // はじめから持っているものも消えない。
  starters.forEach((id) => expect(loadUnlocked(store)).toContain(id));
});

it("並びは いつもカタログ順（保存の順ではない）", () => {
  earn(20);
  const have = loadUnlocked(store);
  const order = MY_SPARKLES.map((s) => s.id).filter((id) => have.includes(id));
  expect(have).toEqual(order);
});
