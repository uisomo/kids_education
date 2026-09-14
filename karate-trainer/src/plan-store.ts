// Plan store (Tower E2): the household's subscription plan. Billing is mock (no
// real payment — localStorage only) but the LIMITS are enforced for real by the
// app (members) and the preset / kufu stores. One plan covers the whole
// household, matching how Apple bills a subscription per Apple ID rather than
// per child, so it lives unscoped in the base storage.
//
// Plans & limits:
//   Free     ¥0                        kids 1  presets 1   工夫 1 (1 種目 only)
//   Premium  ¥980/月 or ¥9,800/年      kids 1  presets 20  工夫 10 (any 種目)
//   Family   ¥1,480/月 or ¥14,800/年   kids 5  presets 20  工夫 10 (any 種目)

import { loadMembers } from "./member-store";
import { scopeKey } from "./scoped-storage";

export type Plan = "free" | "premium" | "family";

export interface PlanLimits {
  members: number;      // max usable members (kids); extras are locked, not deleted
  presets: number;      // max saved presets (=menus/classes)
  kufu: number;         // max 工夫 history per drill; 0 disables 工夫 entirely
  maxKufuDrills: number; // max distinct 種目 that may have any saved 工夫 at once
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { members: 1, presets: 1, kufu: 1, maxKufuDrills: 1 },
  premium: { members: 1, presets: 20, kufu: 10, maxKufuDrills: Infinity },
  family: { members: 5, presets: 20, kufu: 10, maxKufuDrills: Infinity },
};

export interface PlanMeta {
  label: string;         // display name
  monthly: string;       // display monthly price
  yearly: string | null; // display yearly price (null = no yearly option)
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: { label: "フリー", monthly: "¥0", yearly: null },
  premium: { label: "プレミアム", monthly: "¥980/月", yearly: "¥9,800/年" },
  family: { label: "ファミリー", monthly: "¥1,480/月", yearly: "¥14,800/年" },
};

const KEY = "karate.householdPlan";
const DEFAULT_PLAN: Plan = "free";

// Earlier plan storage, read once to carry existing households over.
const LEGACY_MEMBER_KEY = "karate.plan";       // per member: "standard" | "max"
const LEGACY_FAMILY_KEY = "karate.familyPlan"; // household: "on"

function isPlan(v: unknown): v is Plan {
  return v === "free" || v === "premium" || v === "family";
}

// Carry an older install over: Family stays Family, and any member on the old
// Standard or Max plan makes the household Premium. Otherwise Free.
function migrate(base: Storage): Plan {
  if (base.getItem(LEGACY_FAMILY_KEY) === "on") return "family";
  const paid = loadMembers(base).some((m) => {
    const old = base.getItem(scopeKey(m.id, LEGACY_MEMBER_KEY));
    return old === "standard" || old === "max";
  });
  return paid ? "premium" : "free";
}

export function loadPlan(base: Storage = localStorage): Plan {
  try {
    const raw = base.getItem(KEY);
    if (isPlan(raw)) return raw;
    const plan = migrate(base);
    base.setItem(KEY, plan);
    return plan;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function setPlan(plan: Plan, base: Storage = localStorage): void {
  try {
    base.setItem(KEY, plan);
  } catch {
    /* ignore storage errors */
  }
}
