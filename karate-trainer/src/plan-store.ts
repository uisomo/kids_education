// Plan store (Tower E2): the household's subscription plan. On the iOS app the
// plan follows App Store subscriptions (billing.ts) and this is its offline
// cache; without billing (web, tests) the plan cards set it directly. The
// LIMITS are enforced by the app (members) and the preset / kufu stores. One plan covers the whole
// household, matching how Apple bills a subscription per Apple ID rather than
// per child, so it lives unscoped in the base storage.
//
// Plans & limits:
//   Free     ¥0                        kids 1  menus 1       工夫 1
//   Premium  ¥980/月 or ¥9,800/年      kids 1  menus 5       工夫 3/種目, 150
//   Family   ¥1,480/月 or ¥14,800/年   kids 5  menus 5/kid   工夫 3/種目, 150/kid
// Menus are household-shared, so the cap is presetsPerMember × usable kids.

import { loadMembers } from "./member-store";
import { scopeKey } from "./scoped-storage";

export type Plan = "free" | "premium" | "family";

export interface PlanLimits {
  members: number;      // max usable members (kids); extras are locked, not deleted
  presetsPerMember: number; // saved menus (presets/classes) per usable kid
  kufuPerDrill: number;     // 工夫 per 種目; 0 disables 工夫 entirely
  kufuTotal: number;        // 工夫 per kid, across every 種目
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { members: 1, presetsPerMember: 1, kufuPerDrill: 1, kufuTotal: 1 },
  premium: { members: 1, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 },
  family: { members: 5, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 },
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
