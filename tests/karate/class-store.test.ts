import { it, expect } from "vitest";
import { getAssignedClass, setAssignedClass } from "../../karate-trainer/src/class-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import type { Preset } from "../../karate-trainer/src/preset-store";

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

const preset = (id: string): Preset => ({ id, name: id, menu: [] });

it("defaults to null (unassigned) when nothing is stored", () => {
  expect(getAssignedClass([preset("p1")], memStorage())).toBeNull();
});

it("persists and reads back an assigned class id", () => {
  const s = memStorage();
  setAssignedClass("p1", s);
  expect(getAssignedClass([preset("p1")], s)).toBe("p1");
});

it("treats a dangling id (preset deleted) as unassigned", () => {
  const s = memStorage();
  setAssignedClass("p1", s);
  // p1 no longer exists in the family's preset list.
  expect(getAssignedClass([preset("p2")], s)).toBeNull();
});

it("clears the assignment when set to null", () => {
  const s = memStorage();
  setAssignedClass("p1", s);
  setAssignedClass(null, s);
  expect(getAssignedClass([preset("p1")], s)).toBeNull();
});

it("returns null on a corrupt stored value", () => {
  const s = memStorage();
  s.setItem("karate.assignedClass", "{oops");
  expect(getAssignedClass([preset("p1")], s)).toBeNull();
});

it("keeps assignments isolated per member via scoped storage", () => {
  const base = memStorage();
  const a = scopedStorage(base, "alice");
  const b = scopedStorage(base, "bob");
  const presets = [preset("p1"), preset("p2")];
  setAssignedClass("p1", a);
  setAssignedClass("p2", b);
  expect(getAssignedClass(presets, a)).toBe("p1");
  expect(getAssignedClass(presets, b)).toBe("p2");
});
