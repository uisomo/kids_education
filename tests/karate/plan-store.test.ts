import { it, expect } from "vitest";
import { loadPlan, setPlan, PLAN_LIMITS, PLAN_META } from "../../karate-trainer/src/plan-store";
import { scopeKey } from "../../karate-trainer/src/scoped-storage";
import { addMember, getActiveId } from "../../karate-trainer/src/member-store";

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

it("defaults a fresh household to the free plan", () => {
  expect(loadPlan(memStorage())).toBe("free");
});

it("persists and reads back the household plan", () => {
  const s = memStorage();
  setPlan("premium", s);
  expect(loadPlan(s)).toBe("premium");
  setPlan("family", s);
  expect(loadPlan(s)).toBe("family");
});

it("falls back to the migrated plan on a corrupt stored value", () => {
  const s = memStorage();
  s.setItem("karate.householdPlan", "platinum");
  expect(loadPlan(s)).toBe("free");
});

it("carries an old Family flag over as Family", () => {
  const s = memStorage();
  s.setItem("karate.familyPlan", "on");
  expect(loadPlan(s)).toBe("family");
});

it("carries any member's old Standard or Max plan over as Premium, and remembers it", () => {
  const s = memStorage();
  getActiveId(s);                                   // default member, on Free
  const taro = addMember("たろう", s);
  s.setItem(scopeKey(taro.id, "karate.plan"), "standard");
  expect(loadPlan(s)).toBe("premium");
  expect(s.getItem("karate.householdPlan")).toBe("premium");

  const s2 = memStorage();
  s2.setItem(scopeKey(getActiveId(s2), "karate.plan"), "max");
  expect(loadPlan(s2)).toBe("premium");
});

it("exposes the plan limits (free/premium/family)", () => {
  expect(PLAN_LIMITS.free).toEqual({ members: 1, presetsPerMember: 1, kufuPerDrill: 1, kufuTotal: 1 });
  expect(PLAN_LIMITS.premium).toEqual({ members: 1, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 });
  expect(PLAN_LIMITS.family).toEqual({ members: 5, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 });
});

it("exposes monthly and yearly prices", () => {
  expect(PLAN_META.free).toMatchObject({ monthly: "¥0", yearly: null });
  expect(PLAN_META.premium).toMatchObject({ monthly: "¥980/月", yearly: "¥9,800/年" });
  expect(PLAN_META.family).toMatchObject({ monthly: "¥1,480/月", yearly: "¥14,800/年" });
});
