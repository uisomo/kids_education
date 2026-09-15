import { describe, it, expect } from "vitest";
import { loadMenu, saveMenu, totalSeconds, formatMMSS, DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe("menu store", () => {
  it("returns the default menu when storage is empty", () => {
    expect(loadMenu(fakeStorage())).toEqual(DEFAULT_MENU);
  });
  it("round-trips a saved menu", () => {
    const s = fakeStorage();
    const menu = [{ id: "a", name: "前蹴り", seconds: 20, kind: "drill" as const }];
    saveMenu(menu, s);
    expect(loadMenu(s)).toEqual(menu);
  });
  it("falls back to default on corrupt data", () => {
    const s = fakeStorage();
    s.setItem("karate.menu", "{not json");
    expect(loadMenu(s)).toEqual(DEFAULT_MENU);
  });
  it("sums seconds including rests", () => {
    expect(totalSeconds(DEFAULT_MENU)).toBe(270);   // 基本: 5 moves + 4 休憩, 30 s each
  });
  it("formats mm:ss", () => {
    expect(formatMMSS(180)).toBe("3:00");
    expect(formatMMSS(65)).toBe("1:05");
  });
});
