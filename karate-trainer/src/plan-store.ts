// Plan store (Tower E2): the household's subscription plan. On the iOS app the
// plan follows App Store subscriptions (billing.ts) and this is its offline
// cache; without billing (web, tests) the plan cards set it directly. The
// LIMITS are enforced by the app (members) and the preset / kufu stores. One plan covers the whole
// household, matching how Apple bills a subscription per Apple ID rather than
// per child, so it lives unscoped in the base storage.
//
// Plans & limits:
//   Free     ¥0                        kids 1  menus 1       工夫 1
//   Premium  ¥1,000/月 or ¥10,000/年   kids 1  menus 5       工夫 3/種目, 150
//   Family   ¥1,500/月 or ¥15,000/年   kids 5  menus 5/kid   工夫 3/種目, 150/kid
//   Suite    ¥5,000/月 or ¥50,000/年   ファミリーと おなじ（アランの アプリ ぜんぶ。SERIES_GUIDE 5.8b）
// Menus are household-shared, so the cap is presetsPerMember × usable kids.
// プランの 名前・人数・ねだんは シリーズ共通の alan-billing（PLANS）が 正本。
// フリーの 上限は「1日の 回数」でなく メニュー・工夫の 数（SERIES_GUIDE 5.8c の 空手の ちがい）。

import { type Plan as SeriesPlan, PLAN_ORDER, PLANS } from "./alan/alan-billing.js";
import { loadMembers } from "./member-store";
import { scopeKey } from "./scoped-storage";
import { TEST_MODE } from "./test-mode";

export type Plan = SeriesPlan;

export interface PlanLimits {
  members: number;      // max usable members (kids); extras are locked, not deleted
  presetsPerMember: number; // saved menus (presets/classes) per usable kid
  kufuPerDrill: number;     // 工夫 per 種目; 0 disables 工夫 entirely
  kufuTotal: number;        // 工夫 per kid, across every 種目
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { members: PLANS.free.members, presetsPerMember: 1, kufuPerDrill: 1, kufuTotal: 1 },
  premium: { members: PLANS.premium.members, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 },
  family: { members: PLANS.family.members, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 },
  // スイートは ファミリーと おなじ
  suite: { members: PLANS.suite.members, presetsPerMember: 5, kufuPerDrill: 3, kufuTotal: 150 },
};

export interface PlanMeta {
  label: string;         // display name
  monthly: string;       // display monthly price
  yearly: string | null; // display yearly price (null = no yearly option)
}

export const PLAN_META: Record<Plan, PlanMeta> = Object.fromEntries(PLAN_ORDER.map((plan) => {
  const p = PLANS[plan];
  return [plan, { label: p.label, monthly: p.monthly ? `${p.monthly}/月` : "¥0", yearly: p.yearly ? `${p.yearly}/年` : null }];
})) as Record<Plan, PlanMeta>;

const KEY = "karate.householdPlan";
const DEFAULT_PLAN: Plan = "free";

// Earlier plan storage, read once to carry existing households over.
const LEGACY_MEMBER_KEY = "karate.plan";       // per member: "standard" | "max"
const LEGACY_FAMILY_KEY = "karate.familyPlan"; // household: "on"

function isPlan(v: unknown): v is Plan {
  return (PLAN_ORDER as unknown[]).includes(v);
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
    // テスト版は スイートから（ぜんぶ ためせる。alan-billing の testBuild と おなじ）。
    // プランの カードで あとから 切りかえられる。
    const plan: Plan = TEST_MODE ? "suite" : migrate(base);
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
