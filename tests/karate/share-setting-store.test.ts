import { it, expect } from "vitest";
import { getShareAllowed, setShareAllowed } from "../../karate-trainer/src/share-setting-store";

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

it("is off until a parent turns it on, and can be turned off again", () => {
  const s = memStorage();
  expect(getShareAllowed(s)).toBe(false);
  setShareAllowed(true, s);
  expect(getShareAllowed(s)).toBe(true);
  setShareAllowed(false, s);
  expect(getShareAllowed(s)).toBe(false);
});
