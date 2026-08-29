import { it, expect, beforeEach } from "vitest";
import { bumpDrills, countFor, loadCounts, levelFor, PER_LEVEL } from "../../karate-trainer/src/progress-store";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("increments each drill once per session (deduped)", () => {
  bumpDrills(["前蹴り", "回し蹴り", "前蹴り"], s);   // 前蹴り appears twice → +1
  expect(countFor("前蹴り", s)).toBe(1);
  expect(countFor("回し蹴り", s)).toBe(1);
  bumpDrills(["前蹴り"], s);
  expect(countFor("前蹴り", s)).toBe(2);
});

it("levelFor computes level and in-level progress", () => {
  expect(levelFor(0)).toEqual({ level: 0, inLevel: 0, count: 0 });
  expect(levelFor(7)).toEqual({ level: 0, inLevel: 7, count: 7 });
  expect(levelFor(10)).toEqual({ level: 1, inLevel: 0, count: 10 });
  expect(levelFor(23)).toEqual({ level: 2, inLevel: 3, count: 23 });
  expect(PER_LEVEL).toBe(10);
});

it("loadCounts returns all counts", () => {
  bumpDrills(["A", "B"], s);
  bumpDrills(["A"], s);
  expect(loadCounts(s)).toEqual({ A: 2, B: 1 });
});
