import { describe, it, expect } from "vitest";
import { loadPresets, savePreset, deletePreset, updatePreset } from "../../karate-trainer/src/preset-store";
import type { Menu } from "../../karate-trainer/src/types";

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

const menuA: Menu = [{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }];
const menuB: Menu = [{ id: "b", name: "型", seconds: 60, kind: "drill" }];

describe("preset store", () => {
  it("returns an empty list when nothing is saved", () => {
    expect(loadPresets(fakeStorage())).toEqual([]);
  });

  it("saves a named preset and lists it back", () => {
    const s = fakeStorage();
    const p = savePreset("基本稽古", menuA, s)!;
    expect(p.name).toBe("基本稽古");
    const list = loadPresets(s);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("基本稽古");
    expect(list[0].menu).toEqual(menuA);
    expect(list[0].id).toBeTruthy();
  });

  it("stores a deep copy so later edits to the source menu don't mutate the preset", () => {
    const s = fakeStorage();
    const src: Menu = [{ id: "x", name: "元", seconds: 30, kind: "drill" }];
    savePreset("スナップ", src, s);
    src[0].name = "変更後";
    expect(loadPresets(s)[0].menu[0].name).toBe("元");
  });

  it("keeps multiple presets and persists across a fresh load", () => {
    const s = fakeStorage();
    savePreset("A", menuA, s);
    savePreset("B", menuB, s);
    const list = loadPresets(s);
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("deletes a preset by id", () => {
    const s = fakeStorage();
    const a = savePreset("A", menuA, s)!;
    savePreset("B", menuB, s);
    deletePreset(a.id, s);
    const list = loadPresets(s);
    expect(list.map((p) => p.name)).toEqual(["B"]);
  });

  it("falls back to an empty list on corrupt data", () => {
    const s = fakeStorage();
    s.setItem("karate.presets", "{not json");
    expect(loadPresets(s)).toEqual([]);
  });

  it("refuses to save (returns null) when already at the plan cap", () => {
    const s = fakeStorage();
    expect(savePreset("A", menuA, s, 1)).not.toBeNull();
    expect(savePreset("B", menuB, s, 1)).toBeNull();   // cap 1 reached
    expect(loadPresets(s).map((p) => p.name)).toEqual(["A"]);
  });

  it("still saves when under the cap", () => {
    const s = fakeStorage();
    savePreset("A", menuA, s, 2);
    expect(savePreset("B", menuB, s, 2)).not.toBeNull();
    expect(loadPresets(s)).toHaveLength(2);
  });

  it("returns null / false instead of throwing when storage is full", () => {
    const s = fakeStorage();
    const a = savePreset("A", menuA, s)!;
    const full = { ...s, getItem: s.getItem, setItem: () => { throw new Error("QuotaExceededError"); } } as Storage;
    expect(() => savePreset("B", menuB, full)).not.toThrow();
    expect(savePreset("B", menuB, full)).toBeNull();
    expect(deletePreset(a.id, full)).toBe(false);
    expect(updatePreset(a.id, menuB, full)).toBe(false);
    expect(loadPresets(s).map((p) => p.name)).toEqual(["A"]);
  });

  it("deletePreset returns true on success", () => {
    const s = fakeStorage();
    const a = savePreset("A", menuA, s)!;
    expect(deletePreset(a.id, s)).toBe(true);
    expect(loadPresets(s)).toEqual([]);
  });

  it("updatePreset overwrites a preset's menu with a deep copy (上書き保存)", () => {
    const s = fakeStorage();
    const a = savePreset("A", menuA, s)!;
    savePreset("B", menuA, s);
    const next: Menu = [{ id: "n", name: "新しい", seconds: 20, kind: "rest" }];
    expect(updatePreset(a.id, next, s)).toBe(true);
    next[0].name = "あとで変更";
    const list = loadPresets(s);
    expect(list[0]).toMatchObject({ id: a.id, name: "A" });
    expect(list[0].menu).toEqual([{ id: "n", name: "新しい", seconds: 20, kind: "rest" }]);
    expect(list[1].menu).toEqual(menuA);
  });

  it("updatePreset returns false for an unknown id or a malformed menu", () => {
    const s = fakeStorage();
    const a = savePreset("A", menuA, s)!;
    expect(updatePreset("nope", menuB, s)).toBe(false);
    expect(updatePreset(a.id, [{ name: 1 }] as unknown as Menu, s)).toBe(false);
    expect(loadPresets(s)[0].menu).toEqual(menuA);
  });

  it("drops presets with malformed menu entries but keeps the valid ones", () => {
    const s = fakeStorage();
    s.setItem("karate.presets", JSON.stringify([
      { id: "ok", name: "OK", menu: menuA },
      { id: "bad1", name: "no seconds", menu: [{ id: "x", name: "x", kind: "drill" }] },
      { id: "bad2", name: "bad kind", menu: [{ id: "x", name: "x", seconds: 3, kind: "jump" }] },
      { id: "bad3", name: "null entry", menu: [null] },
      { id: "bad4", name: "not array", menu: "nope" },
      "junk",
    ]));
    expect(loadPresets(s).map((p) => p.id)).toEqual(["ok"]);
  });
});
