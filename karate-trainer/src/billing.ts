// App Store subscriptions. The household's plan comes from what Apple says it
// bought (RevenueCat entitlements), never from a tap in the UI; plan-store
// keeps the last known plan so the limits still apply offline.
//
// App Store Connect / RevenueCat setup this code expects:
//   products      premium_monthly, premium_yearly, family_monthly, family_yearly
//                 (one subscription group, Family ranked above Premium)
//   entitlements  "premium" and "family" (family products grant family)
//   offering      the current offering holds a package for each product

import type { Plan } from "./plan-store";

export type PaidPlan = Exclude<Plan, "free">;
export type Period = "monthly" | "yearly";
export type ProductId = `${PaidPlan}_${Period}`;

export const PRODUCT_IDS: ProductId[] = ["premium_monthly", "premium_yearly", "family_monthly", "family_yearly"];

// Apple's standard EULA is accepted as the Terms of Use link. The privacy
// policy has to be hosted somewhere public before release.
export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const PRIVACY_URL = "";
export const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

// Store product ids that stand for ours: the RevenueCat Test Store products
// were created as monthly / yearly (Premium) and monthly_2 / yearly_2 (Family).
const STORE_ALIASES: Record<string, ProductId> = {
  monthly: "premium_monthly",
  yearly: "premium_yearly",
  monthly_2: "family_monthly",
  yearly_2: "family_yearly",
};

export function toProductId(storeId: string): ProductId | null {
  return (PRODUCT_IDS as string[]).includes(storeId) ? storeId as ProductId : STORE_ALIASES[storeId] ?? null;
}

export function productId(plan: PaidPlan, period: Period): ProductId {
  return `${plan}_${period}`;
}

export function planOfProduct(id: string): Plan {
  if (id.startsWith("family_")) return "family";
  if (id.startsWith("premium_")) return "premium";
  return "free";
}

// Family outranks Premium when both are active (e.g. mid-upgrade).
export function planFromEntitlements(active: Iterable<string>): Plan {
  const set = new Set(active);
  if (set.has("family")) return "family";
  if (set.has("premium")) return "premium";
  return "free";
}

export interface BillingInfo {
  plan: Plan;
  productId: string | null;   // the subscription behind the plan
  expiresAt: string | null;   // ISO date of the current period's end
  willRenew: boolean;
}

export type PurchaseOutcome =
  | { status: "purchased"; info: BillingInfo }
  | { status: "cancelled" }
  | { status: "pending" }     // Ask to Buy / payment needs approval
  | { status: "error"; message: string };

export interface Billing {
  // Latest subscription state (the SDK's cache when offline); null when it
  // can't be read at all.
  refresh(): Promise<BillingInfo | null>;
  // Localized store prices ("¥980") per product. Missing = not for sale now.
  prices(): Promise<Partial<Record<ProductId, string>>>;
  purchase(id: ProductId): Promise<PurchaseOutcome>;
  restore(): Promise<BillingInfo | null>;
  // Apple's page for changing or cancelling the subscription.
  manage(): Promise<void>;
  // Renewals, expiries and purchases made elsewhere (another device).
  onChange(cb: (info: BillingInfo) => void): void;
}

// "2026/10/15 に自動更新" / "2026/10/15 まで（自動更新オフ）"; "" on Free.
export function renewalText(info: BillingInfo | null): string {
  if (!info || info.plan === "free" || !info.expiresAt) return "";
  const d = new Date(info.expiresAt);
  if (Number.isNaN(d.getTime())) return "";
  const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return info.willRenew ? `${date} に自動更新` : `${date} まで（自動更新オフ）`;
}
