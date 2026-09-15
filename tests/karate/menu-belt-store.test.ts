import { it, expect, beforeEach } from "vitest";
import {
  drillNames, loadMenuBelt, levelOf, beltStateFor, recordPractice, setMenuBelt, removeMenuBelt,
  getSelectedPreset, setSelectedPreset, MAX_LEVEL,
} from "../../karate-trainer/src/menu-belt-store";
import { BELTS } from "../../karate-trainer/src/belt-store";
import type { Menu } from "../../karate-trainer/src/types";

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

const menu: Menu = [
  { id: "a", name: "前蹴り", seconds: 30, kind: "drill" },
  { id: "r", name: "休憩", seconds: 15, kind: "rest" },
  { id: "b", name: "回し蹴り ", seconds: 30, kind: "drill" },
  { id: "c", name: "前蹴り", seconds: 30, kind: "drill" },
];

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("counts each named drill once, without 休憩", () => {
  expect(drillNames(menu)).toEqual(["前蹴り", "回し蹴り"]);
});

it("a new menu starts on the member's old belt with every level at 0", () => {
  s.setItem("karate.belt", JSON.stringify({ index: 3, bars: 6 }));
  const mb = loadMenuBelt("p1", s);
  expect(mb.belt).toBe(3);
  expect(beltStateFor(mb, menu)).toEqual({ index: 3, bars: 0 });
});

it("each finished drill gains one level; the belt bars follow the lowest", () => {
  recordPractice("p1", menu, ["前蹴り", "前蹴り", "回し蹴り"], s);
  let r = recordPractice("p1", menu, ["前蹴り"], s);
  const mb = loadMenuBelt("p1", s);
  expect(levelOf(mb, "前蹴り")).toBe(2);   // once per practice, even when listed twice
  expect(levelOf(mb, "回し蹴り")).toBe(1);
  expect(r.state.bars).toBe(1);
  r = recordPractice("p1", menu, ["回し蹴り"], s);
  expect(r.state.bars).toBe(2);
});

it("a drill stops at Lv.10 and the belt waits for the others", () => {
  for (let i = 0; i < 14; i++) recordPractice("p1", menu, ["前蹴り"], s);
  const mb = loadMenuBelt("p1", s);
  expect(levelOf(mb, "前蹴り")).toBe(MAX_LEVEL);
  expect(beltStateFor(mb, menu)).toEqual({ index: 0, bars: 0 });
});

it("when every drill reaches Lv.10 the belt goes up and all levels reset", () => {
  for (let i = 0; i < 9; i++) recordPractice("p1", menu, ["前蹴り", "回し蹴り"], s);
  recordPractice("p1", menu, ["前蹴り"], s);
  const last = recordPractice("p1", menu, ["回し蹴り"], s);
  expect(last.promoted).toBe(true);
  expect(last.state).toEqual({ index: 1, bars: 0 });
  const mb = loadMenuBelt("p1", s);
  expect(levelOf(mb, "前蹴り")).toBe(0);
  expect(levelOf(mb, "回し蹴り")).toBe(0);
});

it("the top belt stays full instead of resetting", () => {
  setMenuBelt("p1", BELTS.length - 1, s);
  let r = { promoted: false, state: { index: 0, bars: 0 } };
  for (let i = 0; i < 12; i++) r = recordPractice("p1", menu, ["前蹴り", "回し蹴り"], s);
  expect(r.promoted).toBe(false);
  expect(r.state).toEqual({ index: BELTS.length - 1, bars: MAX_LEVEL });
});

it("menus keep separate belts and levels", () => {
  recordPractice("p1", menu, ["前蹴り"], s);
  expect(levelOf(loadMenuBelt("p2", s), "前蹴り")).toBe(0);
});

it("a parent-set belt starts that menu's levels over; a deleted menu loses its belt", () => {
  recordPractice("p1", menu, ["前蹴り", "回し蹴り"], s);
  expect(setMenuBelt("p1", 99, s).belt).toBe(BELTS.length - 1);
  expect(levelOf(loadMenuBelt("p1", s), "前蹴り")).toBe(0);
  removeMenuBelt("p1", s);
  expect(loadMenuBelt("p1", s).belt).toBe(0);
});

it("remembers the picked menu", () => {
  expect(getSelectedPreset(s)).toBeNull();
  setSelectedPreset("p9", s);
  expect(getSelectedPreset(s)).toBe("p9");
  setSelectedPreset(null, s);
  expect(getSelectedPreset(s)).toBeNull();
});

it("drops a corrupt entry without losing the others", () => {
  recordPractice("p1", menu, ["前蹴り"], s);
  const raw = JSON.parse(s.getItem("karate.menuBelts")!);
  raw.bad = { belt: "x" };
  s.setItem("karate.menuBelts", JSON.stringify(raw));
  expect(levelOf(loadMenuBelt("p1", s), "前蹴り")).toBe(1);
});
