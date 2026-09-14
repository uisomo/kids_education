// Plan store (Tower E2): subscription plans. Billing is mock (no real
// payment — localStorage only) but the LIMITS are enforced for real by the
// preset / kufu stores. Free/Standard/Max are stored per-member: written
// through mem() (scopedStorage on the active member), so each kid has their
// own plan, like menu / kufu / XP. Family is a single flag in the unscoped base
// storage: while it's on it covers every member and overrides their own plans.
//
// Plans & limits (monthly):
//   Free     $0            presets 1   工夫 1 (1 種目 only)  Standard/Max 工夫 1/10 (any 種目)
//   Standard $5 / ¥500     presets 10  工夫 1                 (per member)
//   Max      $25 / ¥2500   presets 20  工夫 10                (per member)
//   Family   $30 / ¥3000   presets 20  工夫 10                (every member)

export type MemberPlan = "free" | "standard" | "max";
export type Plan = MemberPlan | "family";

export interface PlanLimits {
  presets: number;      // max saved presets (=menus/classes)
  kufu: number;         // max 工夫 history per drill; 0 disables 工夫 entirely
  maxKufuDrills: number; // max distinct 種目 that may have any saved 工夫 at once
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { presets: 1, kufu: 1, maxKufuDrills: 1 },
  standard: { presets: 10, kufu: 1, maxKufuDrills: Infinity },
  max: { presets: 20, kufu: 10, maxKufuDrills: Infinity },
  family: { presets: 20, kufu: 10, maxKufuDrills: Infinity },
};

export interface PlanMeta {
  label: string; // display name
  price: string; // display monthly price (per member; Family covers everyone)
}

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: { label: "フリー", price: "$0" },
  standard: { label: "スタンダード", price: "$5・¥500" },
  max: { label: "マックス", price: "$25・¥2500" },
  family: { label: "ファミリー", price: "$30・¥3000" },
};

const KEY = "karate.plan";
const FAMILY_KEY = "karate.familyPlan";
const DEFAULT_PLAN: MemberPlan = "free";

function isMemberPlan(v: unknown): v is MemberPlan {
  return v === "free" || v === "standard" || v === "max";
}

export function loadPlan(storage: Storage = localStorage): MemberPlan {
  try {
    const raw = storage.getItem(KEY);
    return isMemberPlan(raw) ? raw : DEFAULT_PLAN;
  } catch {
    return DEFAULT_PLAN;
  }
}

export function setPlan(plan: MemberPlan, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, plan);
  } catch {
    /* ignore storage errors */
  }
}

// Family plan flag. Pass the unscoped base storage — it is family-wide.
export function loadFamilyPlan(base: Storage = localStorage): boolean {
  try {
    return base.getItem(FAMILY_KEY) === "on";
  } catch {
    return false;
  }
}

export function setFamilyPlan(on: boolean, base: Storage = localStorage): void {
  try {
    if (on) base.setItem(FAMILY_KEY, "on");
    else base.removeItem(FAMILY_KEY);
  } catch {
    /* ignore storage errors */
  }
}

// The plan that actually applies to a member: Family while it's on, otherwise
// the member's own plan. `base` is unscoped; `member` is that member's scope.
export function effectivePlan(base: Storage, member: Storage): Plan {
  return loadFamilyPlan(base) ? "family" : loadPlan(member);
}
