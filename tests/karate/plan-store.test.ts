import { it, expect } from "vitest";
import {
  loadPlan,
  setPlan,
  PLAN_LIMITS,
  PLAN_META,
} from "../../karate-trainer/src/plan-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";

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

it("defaults to the free plan when nothing is stored", () => {
  expect(loadPlan(memStorage())).toBe("free");
});

it("persists and reads back a plan", () => {
  const s = memStorage();
  setPlan("max", s);
  expect(loadPlan(s)).toBe("max");
});

it("falls back to free on a corrupt / unknown stored value", () => {
  const s = memStorage();
  s.setItem("karate.plan", "platinum");
  expect(loadPlan(s)).toBe("free");
});

it("keeps plans isolated per member via scoped storage", () => {
  const base = memStorage();
  const a = scopedStorage(base, "alice");
  const b = scopedStorage(base, "bob");
  setPlan("max", a);
  setPlan("standard", b);
  expect(loadPlan(a)).toBe("max");
  expect(loadPlan(b)).toBe("standard");
});

it("exposes the plan limits from memory (free/standard/max)", () => {
  expect(PLAN_LIMITS.free).toEqual({ presets: 1, kufu: 0 });
  expect(PLAN_LIMITS.standard).toEqual({ presets: 10, kufu: 1 });
  expect(PLAN_LIMITS.max).toEqual({ presets: 20, kufu: 10 });
});

it("exposes display metadata for each plan", () => {
  expect(PLAN_META.free.label).toBeTruthy();
  expect(PLAN_META.standard.price).toBeTruthy();
  expect(PLAN_META.max.price).toBeTruthy();
});
