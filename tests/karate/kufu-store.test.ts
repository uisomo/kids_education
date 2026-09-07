import { it, expect, beforeEach } from "vitest";
import { loadKufu, latestKufu, addKufu, trimKufuHistory, canAddKufu, KUFU_MAX_LEN } from "../../karate-trainer/src/kufu-store";

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

it("stores newest-first and returns the latest", () => {
  addKufu("前蹴り", "腰を落とす", s);
  addKufu("前蹴り", "軸足まっすぐ", s);
  expect(loadKufu("前蹴り", s)).toEqual(["軸足まっすぐ", "腰を落とす"]);
  expect(latestKufu("前蹴り", s)).toBe("軸足まっすぐ");
});

it("keeps at most 10 per drill", () => {
  for (let i = 1; i <= 13; i++) addKufu("回し蹴り", `工夫${i}`, s);
  const list = loadKufu("回し蹴り", s);
  expect(list).toHaveLength(10);
  expect(list[0]).toBe("工夫13");        // newest
  expect(list[9]).toBe("工夫4");         // oldest kept
});

it("caps each note at 15 chars and trims", () => {
  const long = "あ".repeat(30);
  addKufu("突き", `  ${long}  `, s);
  expect(latestKufu("突き", s)).toHaveLength(KUFU_MAX_LEN);
});

it("ignores empty / whitespace-only input", () => {
  addKufu("蹴り", "   ", s);
  expect(loadKufu("蹴り", s)).toEqual([]);
});

it("returns empty for unknown drills", () => {
  expect(latestKufu("知らない種目", s)).toBe("");
  expect(loadKufu("知らない種目", s)).toEqual([]);
});

it("saves nothing when the plan limit is 0", () => {
  addKufu("前蹴り", "腰を落とす", s, 0);
  expect(loadKufu("前蹴り", s)).toEqual([]);
});

it("keeps at most `limit` entries when a plan limit is given", () => {
  addKufu("突き", "A", s, 1);
  addKufu("突き", "B", s, 1);
  expect(loadKufu("突き", s)).toEqual(["B"]);   // Standard: only the newest
});

it("trims existing over-limit history on the next write (downgrade)", () => {
  for (let i = 1; i <= 5; i++) addKufu("蹴り", `n${i}`, s);   // 5 entries at default cap
  addKufu("蹴り", "new", s, 1);                                // downgrade to limit 1
  expect(loadKufu("蹴り", s)).toEqual(["new"]);
});

it("trimKufuHistory trims every drill's history down to the limit", () => {
  for (let i = 1; i <= 5; i++) addKufu("突き", `a${i}`, s);
  for (let i = 1; i <= 5; i++) addKufu("蹴り", `b${i}`, s);
  trimKufuHistory(2, s);
  expect(loadKufu("突き", s)).toEqual(["a5", "a4"]);
  expect(loadKufu("蹴り", s)).toEqual(["b5", "b4"]);
});

it("trimKufuHistory with limit 0 clears all history (Free downgrade)", () => {
  addKufu("突き", "x", s);
  addKufu("蹴り", "y", s);
  trimKufuHistory(0, s);
  expect(loadKufu("突き", s)).toEqual([]);
  expect(loadKufu("蹴り", s)).toEqual([]);
});

// --- maxDrills (Free plan: 1 種目 total may have any saved 工夫) ---

it("addKufu allows a first drill to get a note under maxDrills 1", () => {
  addKufu("前蹴り", "腰を落とす", s, 1, 1);
  expect(loadKufu("前蹴り", s)).toEqual(["腰を落とす"]);
});

it("addKufu refuses a NEW drill once maxDrills is reached, leaving it unchanged", () => {
  addKufu("前蹴り", "腰を落とす", s, 1, 1);
  addKufu("回し蹴り", "高く上げる", s, 1, 1);
  expect(loadKufu("前蹴り", s)).toEqual(["腰を落とす"]);
  expect(loadKufu("回し蹴り", s)).toEqual([]);
});

it("addKufu still allows updating a drill that already has the used slot", () => {
  addKufu("前蹴り", "腰を落とす", s, 1, 1);
  addKufu("前蹴り", "軸足まっすぐ", s, 1, 1);
  expect(loadKufu("前蹴り", s)).toEqual(["軸足まっすぐ"]);
});

it("canAddKufu is true for an already-used drill and false for a new one at the cap", () => {
  addKufu("前蹴り", "腰を落とす", s, 1, 1);
  expect(canAddKufu("前蹴り", s, 1)).toBe(true);
  expect(canAddKufu("回し蹴り", s, 1)).toBe(false);
});

it("canAddKufu is true for any drill when no drill has used a slot yet", () => {
  expect(canAddKufu("前蹴り", s, 1)).toBe(true);
});

it("trimKufuHistory drops extra drills down to maxDrills on a plan downgrade", () => {
  addKufu("突き", "a", s, 10, Infinity);
  addKufu("蹴り", "b", s, 10, Infinity);
  trimKufuHistory(10, s, 1);
  const remaining = [loadKufu("突き", s), loadKufu("蹴り", s)].filter((h) => h.length);
  expect(remaining).toHaveLength(1);
});
