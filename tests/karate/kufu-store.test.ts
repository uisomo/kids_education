import { it, expect, beforeEach } from "vitest";
import { loadKufu, latestKufu, addKufu, KUFU_MAX_LEN } from "../../karate-trainer/src/kufu-store";

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
