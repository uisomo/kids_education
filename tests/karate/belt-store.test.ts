import { it, expect } from "vitest";
import { BELTS, BARS_PER_BELT, loadBelt, addSessionBar, setBelt } from "../../karate-trainer/src/belt-store";
import { saveCharacterState } from "../../karate-trainer/src/character-store";

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

it("lists 8 colored belts, then 6 RPG belts ending in でんせつ", () => {
  expect(BELTS).toHaveLength(14);
  expect(BELTS.slice(0, 8).map((b) => b.name)).toEqual(["白帯", "黄帯", "オレンジ帯", "緑帯", "青帯", "紫帯", "茶帯", "黒帯"]);
  expect(BELTS.slice(0, 8).every((b) => !b.rpg)).toBe(true);
  expect(BELTS.slice(8).map((b) => b.name)).toEqual(["ほのおの帯", "いかずちの帯", "クリスタルの帯", "ダイヤモンドの帯", "ドラゴンの帯", "でんせつの帯"]);
  expect(BELTS.slice(8).every((b) => b.rpg)).toBe(true);
});

it("starts a new member on 白帯 with no bars", () => {
  expect(loadBelt(memStorage())).toEqual({ index: 0, bars: 0 });
});

it("fills one bar per finished practice and moves up a belt on the 10th", () => {
  const s = memStorage();
  for (let i = 0; i < 9; i++) expect(addSessionBar(s).promoted).toBe(false);
  expect(loadBelt(s)).toEqual({ index: 0, bars: 9 });

  const tenth = addSessionBar(s);
  expect(tenth.promoted).toBe(true);
  expect(tenth.state).toEqual({ index: 1, bars: 0 });
  expect(loadBelt(s)).toEqual({ index: 1, bars: 0 });
});

it("stays on the top belt with a full meter", () => {
  const s = memStorage();
  setBelt(BELTS.length - 1, s);
  for (let i = 0; i < 15; i++) expect(addSessionBar(s).promoted).toBe(false);
  expect(loadBelt(s)).toEqual({ index: BELTS.length - 1, bars: BARS_PER_BELT });
});

it("lets a parent set any belt, clamped, with the meter reset", () => {
  const s = memStorage();
  addSessionBar(s);
  addSessionBar(s);
  expect(setBelt(10, s)).toEqual({ index: 10, bars: 0 });
  expect(loadBelt(s)).toEqual({ index: 10, bars: 0 });
  expect(setBelt(99, s).index).toBe(BELTS.length - 1);
  expect(setBelt(-3, s).index).toBe(0);
});

it("carries old XP over to the matching belt so nobody drops a belt", () => {
  const cases: [xp: number, index: number][] = [[0, 0], [120, 1], [300, 3], [600, 6], [1500, 7]];
  for (const [xp, index] of cases) {
    const s = memStorage();
    saveCharacterState({ selectedId: "alan", totalXp: xp, completedCount: 0 }, s);
    expect(loadBelt(s)).toEqual({ index, bars: 0 });
  }
});

it("ignores a corrupt stored value", () => {
  const s = memStorage();
  s.setItem("karate.belt", "{oops");
  expect(loadBelt(s)).toEqual({ index: 0, bars: 0 });
});
