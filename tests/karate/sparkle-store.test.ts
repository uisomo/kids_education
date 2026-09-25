// @vitest-environment jsdom
// ✨キラキラ を あつめる決まり。ここが狂うと「がんばったのに何ももらえない」／
// 「一気に全部もらえる」のどちらかになる。
import { it, expect, beforeEach } from "vitest";
import type { Menu } from "../../karate-trainer/src/types";
import {
  MY_SPARKLES, awardForPractice, loadUnlocked, setUnlocked, tierEarned, nextToUnlock,
} from "../../karate-trainer/src/sparkle-store";

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

const drill = (id: string, seconds: number) => ({ id, name: `技${id}`, seconds, kind: "drill" as const });
const rest = (id: string, seconds: number) => ({ id, name: "休憩", seconds, kind: "rest" as const });

// 6分・休憩なし
const longMenu: Menu = [drill("a", 180), drill("b", 180)];
// 6分だが休憩あり（実働5分）
const restMenu: Menu = [drill("a", 150), rest("r", 60), drill("b", 150)];
// 3分半・休憩なし
const shortMenu: Menu = [drill("a", 210)];
// 2分
const tinyMenu: Menu = [drill("a", 120)];

let storage: Storage;
beforeEach(() => { storage = memStorage(); });

const done = (menu: Menu) => ({ completed: true, allDrillsDone: true, menu });

it("最初から持っているのは start のぶんだけ", () => {
  const start = MY_SPARKLES.filter((s) => s.tier === "start").map((s) => s.id);
  expect(loadUnlocked(storage)).toEqual(start);
  expect(start.length).toBeLessThan(MY_SPARKLES.length);
});

it("休憩なし5分いじょうを やり切ると long が1つ", () => {
  expect(tierEarned(done(longMenu))).toBe("long");
  const award = awardForPractice(done(longMenu), storage);
  expect(award.unlocked?.tier).toBe("long");
  expect(loadUnlocked(storage)).toContain(award.unlocked!.id);
});

it("休憩が入っていると、5分あっても long にはならない（short になる）", () => {
  expect(tierEarned(done(restMenu))).toBe("short");
  expect(awardForPractice(done(restMenu), storage).unlocked?.tier).toBe("short");
});

it("3分いじょうで short、3分未満なら何ももらえない", () => {
  expect(tierEarned(done(shortMenu))).toBe("short");
  expect(tierEarned(done(tinyMenu))).toBeNull();
  expect(awardForPractice(done(tinyMenu), storage).unlocked).toBeNull();
});

it("途中でやめた／飛ばした稽古は もらえない", () => {
  expect(awardForPractice({ completed: false, allDrillsDone: true, menu: longMenu }, storage).unlocked).toBeNull();
  expect(awardForPractice({ completed: true, allDrillsDone: false, menu: longMenu }, storage).unlocked).toBeNull();
  expect(loadUnlocked(storage)).toHaveLength(MY_SPARKLES.filter((s) => s.tier === "start").length);
});

it("1回の稽古で開くのは 多くても1つ", () => {
  const before = loadUnlocked(storage).length;
  awardForPractice(done(longMenu), storage);
  expect(loadUnlocked(storage)).toHaveLength(before + 1);
});

it("long を全部そろえたあとは、long の稽古で short が開く", () => {
  setUnlocked(MY_SPARKLES.filter((s) => s.tier !== "short").map((s) => s.id), storage);
  const award = awardForPractice(done(longMenu), storage);
  expect(award.tier).toBe("long");
  expect(award.unlocked?.tier).toBe("short");
});

it("ぜんぶ持っていたら、やり切っても何も開かない（届いたことは分かる）", () => {
  setUnlocked(MY_SPARKLES.map((s) => s.id), storage);
  const award = awardForPractice(done(longMenu), storage);
  expect(award.unlocked).toBeNull();
  expect(award.alreadyComplete).toBe(true);
  expect(nextToUnlock(storage)).toEqual({ short: undefined, long: undefined });
});

it("カタログから消えた id は持ち物から落ちる", () => {
  storage.setItem("karate.sparkles", JSON.stringify(["もう無いやつ"]));
  expect(loadUnlocked(storage)).not.toContain("もう無いやつ");
});
