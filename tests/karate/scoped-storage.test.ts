import { it, expect } from "vitest";
import { scopedStorage, scopeKey } from "../../karate-trainer/src/scoped-storage";

function memStorage(): Storage {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
  return s;
}

it("prefixes keys with the member id", () => {
  expect(scopeKey("m1", "karate.menu")).toBe("m:m1:karate.menu");
});

it("reads/writes under the scoped key and isolates members", () => {
  const base = memStorage();
  const a = scopedStorage(base, "alice");
  const b = scopedStorage(base, "bob");

  a.setItem("karate.progress", "A-data");
  b.setItem("karate.progress", "B-data");

  expect(a.getItem("karate.progress")).toBe("A-data");
  expect(b.getItem("karate.progress")).toBe("B-data");
  // underlying base holds both, distinctly prefixed
  expect(base.getItem("m:alice:karate.progress")).toBe("A-data");
  expect(base.getItem("m:bob:karate.progress")).toBe("B-data");
});

it("removeItem only affects the scoped key", () => {
  const base = memStorage();
  const a = scopedStorage(base, "alice");
  a.setItem("k", "v");
  a.removeItem("k");
  expect(a.getItem("k")).toBeNull();
});
