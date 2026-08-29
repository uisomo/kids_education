// Plan store (Tower E2): a member's subscription plan. Billing is mock (no real
// payment — localStorage only) but the LIMITS are enforced for real by the
// preset / kufu stores. Stored per-member: written through mem() (scopedStorage
// on the active member), so each kid has their own plan, like menu / kufu / XP.
//
// Plans & limits (see karate-pricing-plans memory):
//   Free     $0            presets 1   工夫 0 (工夫 disabled)
//   Standard $5 / ¥500     presets 10  工夫 1
//   Max      $25 / ¥2500   presets 20  工夫 10

export type Plan = "free" | "standard" | "max";

export interface PlanLimits {
  presets: number; // max saved presets (=menus/classes)
  kufu: number;    // max 工夫 history per drill; 0 disables 工夫 entirely
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { presets: 1, kufu: 0 },
  standard: { presets: 10, kufu: 1 },
  max: { presets: 20, kufu: 10 },
};

export interface PlanMeta {
  label: string; // display name
  price: string; // display price (per member)
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: { label: "フリー", price: "$0" },
  standard: { label: "スタンダード", price: "$5・¥500" },
  max: { label: "マックス", price: "$25・¥2500" },
};

const KEY = "karate.plan";
const DEFAULT_PLAN: Plan = "free";

function isPlan(v: unknown): v is Plan {
  return v === "free" || v === "standard" || v === "max";
}

export function loadPlan(storage: Storage = localStorage): Plan {
  try {
    const raw = storage.getItem(KEY);
    return isPlan(raw) ? raw : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function setPlan(plan: Plan, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, plan);
  } catch {
    /* ignore storage errors */
  }
}
