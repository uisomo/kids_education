import { it, expect, beforeEach } from "vitest";
import {
  loadKufu, kufuNotes, latestKufu, addKufu, canAddKufu, removeKufu, removeKufuAt, clearAllKufu, countKufu,
  renameKufu, pruneKufu, KUFU_MAX_LEN, type KufuCaps,
} from "../../karate-trainer/src/kufu-store";

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

const FREE: KufuCaps = { perDrill: 1, total: 1 };
const PREMIUM: KufuCaps = { perDrill: 3, total: 150 };

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("stores newest-first and returns the latest", () => {
  addKufu("前蹴り", "腰を落とす", s);
  addKufu("前蹴り", "軸足まっすぐ", s);
  expect(loadKufu("前蹴り", s)).toEqual(["軸足まっすぐ", "腰を落とす"]);
  expect(latestKufu("前蹴り", s)).toBe("軸足まっすぐ");
});

it("caps each note at 15 chars, trims, and ignores empty input", () => {
  addKufu("突き", `  ${"あ".repeat(30)}  `, s);
  expect(latestKufu("突き", s)).toHaveLength(KUFU_MAX_LEN);
  addKufu("蹴り", "   ", s);
  expect(loadKufu("蹴り", s)).toEqual([]);
  expect(latestKufu("知らない種目", s)).toBe("");
});

it("allows 3 工夫 per 種目; the 4th is refused until one is erased", () => {
  for (const t of ["a", "b", "c", "d"]) addKufu("前蹴り", t, s, PREMIUM);
  expect(kufuNotes("前蹴り", s, PREMIUM)).toEqual(["c", "b", "a"]);
  expect(canAddKufu("前蹴り", s, PREMIUM)).toBe(false);
  expect(canAddKufu("回し蹴り", s, PREMIUM)).toBe(true);
  removeKufuAt("前蹴り", 1, s);
  expect(kufuNotes("前蹴り", s, PREMIUM)).toEqual(["c", "a"]);
  expect(canAddKufu("前蹴り", s, PREMIUM)).toBe(true);
});

it("stops at the member's total across 種目", () => {
  const caps: KufuCaps = { perDrill: 3, total: 4 };
  for (const t of ["a", "b", "c"]) addKufu("前蹴り", t, s, caps);
  addKufu("回し蹴り", "x", s, caps);
  addKufu("回し蹴り", "y", s, caps);
  expect(kufuNotes("回し蹴り", s, caps)).toEqual(["x"]);
  expect(canAddKufu("突き", s, caps)).toBe(false);
});

it("Free: one 工夫 in all; erasing it lets another 種目 have one", () => {
  addKufu("前蹴り", "ひざ", s, FREE);
  addKufu("前蹴り", "こし", s, FREE);
  addKufu("突き", "ひき", s, FREE);
  expect(loadKufu("前蹴り", s)).toEqual(["ひざ"]);
  expect(loadKufu("突き", s)).toEqual([]);
  removeKufu("前蹴り", s);
  expect(addKufu("突き", "ひき", s, FREE)).toEqual(["ひき"]);
});

it("a plan with 0 工夫 per 種目 saves nothing", () => {
  addKufu("前蹴り", "ひざ", s, { perDrill: 0, total: 0 });
  expect(loadKufu("前蹴り", s)).toEqual([]);
});

it("a downgrade locks 工夫 past the caps without deleting them", () => {
  for (const t of ["a1", "a2", "a3"]) addKufu("突き", t, s);
  addKufu("蹴り", "b1", s);
  expect(kufuNotes("突き", s, FREE)).toEqual(["a3"]);
  expect(kufuNotes("蹴り", s, FREE)).toEqual([]);
  expect(latestKufu("蹴り", s, FREE)).toBe("");
  expect(loadKufu("突き", s)).toHaveLength(3);        // still stored
  expect(kufuNotes("蹴り", s, PREMIUM)).toEqual(["b1"]);  // back on upgrade
});

it("erasing the last 工夫 of a 種目 removes it; clearAllKufu erases everything", () => {
  addKufu("前蹴り", "ひざ", s);
  addKufu("突き", "ひき", s);
  addKufu("突き", "こし", s);
  expect(countKufu(s)).toBe(3);
  removeKufuAt("前蹴り", 0, s);
  removeKufuAt("前蹴り", 5, s);   // out of range: no-op
  expect(countKufu(s)).toBe(2);
  clearAllKufu(s);
  expect(countKufu(s)).toBe(0);
  expect(loadKufu("突き", s)).toEqual([]);
});

it("renameKufu moves notes to the new name (existing notes on the new name win)", () => {
  addKufu("新しい種目", "ひざ", s);
  renameKufu("新しい種目", "前蹴り", s);
  expect(loadKufu("新しい種目", s)).toEqual([]);
  expect(latestKufu("前蹴り", s, FREE)).toBe("ひざ");
  addKufu("突き", "こし", s);
  renameKufu("前蹴り", "突き", s);
  expect(loadKufu("突き", s)).toEqual(["こし"]);
  expect(loadKufu("前蹴り", s)).toEqual([]);
});

it("pruneKufu drops notes for names no menu uses", () => {
  addKufu("消えた種目", "ひざ", s);
  addKufu("前蹴り", "こし", s);
  pruneKufu(["前蹴り"], s);
  expect(loadKufu("消えた種目", s)).toEqual([]);
  expect(loadKufu("前蹴り", s)).toEqual(["こし"]);
  expect(canAddKufu("突き", s, { perDrill: 3, total: 2 })).toBe(true);
});
