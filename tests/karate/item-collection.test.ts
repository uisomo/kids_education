// @vitest-environment jsdom
// 🎒 アイテム の あつめかた — 🧊ブロック（稽古の回数）と 帯・🏆トロフィー。
//
// ここが狂うと、集めたものが消える／一気に全部もらえる のどちらかになる。
import { it, expect, beforeEach } from "vitest";
import { BLOCKS } from "../../karate-trainer/src/block-catalog";
import {
  practiceCount, unlockedBlocks, nextBlock, recordPracticeForBlocks, setPracticeCount,
} from "../../karate-trainer/src/block-store";
import {
  earnBelt, beltCount, loadEarnedBelts, trophies, beltsToNextTrophy, beltCollection,
  seedBeltCollection, setEarnedBelts, BELTS_PER_TROPHY,
} from "../../karate-trainer/src/belt-collection-store";
import { BELTS } from "../../karate-trainer/src/belt-store";

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

let store: Storage;
beforeEach(() => { store = memStorage(); });

// ── 🧊 ブロック ────────────────────────────────────────────────────────────

it("ブロックは 30こ、少ない順に並んでいて、しきい値も増えていく", () => {
  expect(BLOCKS).toHaveLength(30);
  for (let i = 1; i < BLOCKS.length; i++) {
    expect(BLOCKS[i].at).toBeGreaterThan(BLOCKS[i - 1].at);
    expect(BLOCKS[i].cubes).toBeGreaterThanOrEqual(BLOCKS[i - 1].cubes - 5);
  }
  expect(BLOCKS.map((b) => b.at).slice(0, 9)).toEqual([1, 3, 5, 10, 15, 25, 40, 55, 65]);
  // id と絵は1つずつ。
  expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
  expect(new Set(BLOCKS.map((b) => b.src)).size).toBe(BLOCKS.length);
});

it("最初は1つも持っていない", () => {
  expect(unlockedBlocks(store)).toEqual([]);
  expect(practiceCount(store)).toBe(0);
  expect(nextBlock(store)).toEqual({ block: BLOCKS[0], remaining: 1 });
});

it("1回めの稽古で 1つめが開く", () => {
  const award = recordPracticeForBlocks(store);
  expect(award.count).toBe(1);
  expect(award.unlocked?.id).toBe(BLOCKS[0].id);
  expect(unlockedBlocks(store)).toHaveLength(1);
});

it("2回めは 何も開かない（3回めで2つめ）", () => {
  recordPracticeForBlocks(store);
  expect(recordPracticeForBlocks(store).unlocked).toBeNull();
  expect(recordPracticeForBlocks(store).unlocked?.id).toBe(BLOCKS[1].id);
});

it("1回の稽古で 2つ開くことはない", () => {
  for (let i = 0; i < 400; i++) {
    const before = unlockedBlocks(store).length;
    recordPracticeForBlocks(store);
    expect(unlockedBlocks(store).length - before).toBeLessThanOrEqual(1);
  }
});

it("あと何回で つぎが開くか", () => {
  setPracticeCount(4, store);
  expect(nextBlock(store)).toEqual({ block: BLOCKS[2], remaining: 1 });
  setPracticeCount(BLOCKS[BLOCKS.length - 1].at, store);
  expect(nextBlock(store)).toBeNull();
  expect(unlockedBlocks(store)).toHaveLength(BLOCKS.length);
});

// ── 🥋 帯 と 🏆 トロフィー ─────────────────────────────────────────────────

it("帯は もらうたびに 増えていく（同じ色が何本でも）", () => {
  earnBelt(0, store);
  earnBelt(0, store);
  earnBelt(1, store);
  expect(beltCount(store)).toBe(3);
  expect(loadEarnedBelts(store)).toEqual([0, 0, 1]);
  expect(beltCollection(store)[0]).toEqual({ index: 0, count: 2 });
});

it(`${BELTS_PER_TROPHY}本で トロフィーが1つ、色は帯の順`, () => {
  for (let i = 0; i < BELTS_PER_TROPHY - 1; i++) earnBelt(0, store);
  expect(trophies(store)).toEqual([]);
  expect(beltsToNextTrophy(store)).toBe(1);
  earnBelt(0, store);
  const [first] = trophies(store);
  expect(first.number).toBe(1);
  expect(first.fill).toBe(BELTS[0].fill);
  // 種目の名前は入れない（空手ともピアノとも書かない）。
  expect(first.name).not.toContain("空手");
  expect(first.name).not.toContain("ピアノ");
  expect(beltsToNextTrophy(store)).toBe(BELTS_PER_TROPHY);
});

it("トロフィーは 10本ごとに増える", () => {
  setEarnedBelts(Array.from({ length: 25 }, () => 0), store);
  expect(trophies(store)).toHaveLength(2);
  expect(trophies(store)[1].fill).toBe(BELTS[1].fill);
});

it("前の数えかた（いちばん上の帯だけ）から 引きつぐ", () => {
  // 旧データ: 緑帯(3)まで行っていた ＝ 白・黄・オレンジ・緑 の4本。
  store.setItem("karate.beltsCollected", "3");
  expect(beltCount(store)).toBe(4);
  seedBeltCollection([], store);
  expect(loadEarnedBelts(store)).toEqual([0, 1, 2, 3]);
});

it("引きつぎは 一度きり（開くたびに増えない）", () => {
  seedBeltCollection([2], store);
  expect(beltCount(store)).toBe(3);
  seedBeltCollection([2], store);
  seedBeltCollection([5], store);
  expect(beltCount(store)).toBe(3);
});

it("もらった帯は メニューを消しても 消えない", () => {
  seedBeltCollection([1], store);
  earnBelt(2, store);
  // メニューが1つも無くなっても、集めたものはそのまま。
  seedBeltCollection([], store);
  expect(beltCount(store)).toBe(3);
});
