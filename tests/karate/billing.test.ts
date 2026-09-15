import { it, expect } from "vitest";
import { planFromEntitlements, planOfProduct, productId, renewalText, toProductId } from "../../karate-trainer/src/billing";
import { infoFromCustomer } from "../../karate-trainer/src/revenuecat-billing";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";

it("maps active entitlements to a plan, Family outranking Premium", () => {
  expect(planFromEntitlements([])).toBe("free");
  expect(planFromEntitlements(["premium"])).toBe("premium");
  expect(planFromEntitlements(["family"])).toBe("family");
  expect(planFromEntitlements(["premium", "family"])).toBe("family");
  expect(planFromEntitlements(["something_else"])).toBe("free");
});

it("names products by plan and period and reads the plan back", () => {
  expect(productId("premium", "monthly")).toBe("premium_monthly");
  expect(productId("family", "yearly")).toBe("family_yearly");
  expect(planOfProduct("family_monthly")).toBe("family");
  expect(planOfProduct("premium_yearly")).toBe("premium");
  expect(planOfProduct("other")).toBe("free");
});

it("reads the Test Store's product ids as ours", () => {
  expect(toProductId("monthly")).toBe("premium_monthly");
  expect(toProductId("yearly")).toBe("premium_yearly");
  expect(toProductId("monthly_2")).toBe("family_monthly");
  expect(toProductId("yearly_2")).toBe("family_yearly");
  expect(toProductId("family_yearly")).toBe("family_yearly");
  expect(toProductId("weekly")).toBeNull();
});

it("describes renewal or the end date, and nothing on Free", () => {
  const base = { productId: "premium_monthly", expiresAt: "2026-10-15T03:00:00Z" };
  expect(renewalText({ plan: "premium", willRenew: true, ...base })).toBe("2026/10/15 に自動更新");
  expect(renewalText({ plan: "premium", willRenew: false, ...base })).toBe("2026/10/15 まで（自動更新オフ）");
  expect(renewalText({ plan: "free", willRenew: false, productId: null, expiresAt: null })).toBe("");
  expect(renewalText(null)).toBe("");
  expect(renewalText({ plan: "family", willRenew: true, productId: "family_yearly", expiresAt: "garbage" })).toBe("");
});

type Sub = { expiresDate: string | null; unsubscribeDetectedAt: string | null; billingIssuesDetectedAt: string | null };
function customer(
  active: Record<string, { productIdentifier: string; expirationDate: string | null; willRenew: boolean }>,
  activeSubscriptions: string[] = [],
  subscriptionsByProductIdentifier: Record<string, Sub> = {},
): CustomerInfo {
  return { entitlements: { active, all: active }, activeSubscriptions, subscriptionsByProductIdentifier } as unknown as CustomerInfo;
}

it("reads the plan and its subscription from RevenueCat's customer info", () => {
  expect(infoFromCustomer(customer({}))).toEqual({ plan: "free", productId: null, expiresAt: null, willRenew: false });
  expect(infoFromCustomer(customer({
    premium: { productIdentifier: "family_yearly", expirationDate: "2027-01-01T00:00:00Z", willRenew: true },
    family: { productIdentifier: "family_yearly", expirationDate: "2027-01-01T00:00:00Z", willRenew: true },
  }))).toEqual({ plan: "family", productId: "family_yearly", expiresAt: "2027-01-01T00:00:00Z", willRenew: true });
  expect(infoFromCustomer(customer({
    premium: { productIdentifier: "premium_monthly", expirationDate: "2026-10-15T00:00:00Z", willRenew: false },
  }))).toMatchObject({ plan: "premium", productId: "premium_monthly", willRenew: false });
  expect(infoFromCustomer(customer({
    family: { productIdentifier: "yearly_2", expirationDate: "2027-01-01T00:00:00Z", willRenew: true },
  }))).toMatchObject({ plan: "family", productId: "family_yearly" });
});

it("reads the plan from the product when one entitlement holds all four", () => {
  const pro = (productIdentifier: string) => customer({
    "アランの空手_pro": { productIdentifier, expirationDate: "2026-10-15T00:00:00Z", willRenew: true },
  });
  expect(infoFromCustomer(pro("monthly"))).toEqual({ plan: "premium", productId: "premium_monthly", expiresAt: "2026-10-15T00:00:00Z", willRenew: true });
  expect(infoFromCustomer(pro("yearly"))).toMatchObject({ plan: "premium", productId: "premium_yearly" });
  expect(infoFromCustomer(pro("monthly_2"))).toMatchObject({ plan: "family", productId: "family_monthly" });
  expect(infoFromCustomer(pro("yearly_2"))).toMatchObject({ plan: "family", productId: "family_yearly" });
  expect(infoFromCustomer(pro("something_else"))).toMatchObject({ plan: "free" });
});

// Seen on the iPhone SE with the Test Store: after buying monthly, yearly and
// then monthly_2, the entitlement still named yearly (it expires last).
it("the highest active subscription wins, not just the one the entitlement names", () => {
  const c = customer(
    { "アランの空手_pro": { productIdentifier: "yearly", expirationDate: "2026-09-15T14:28:28Z", willRenew: true } },
    ["monthly", "yearly", "monthly_2"],
    { monthly_2: { expiresDate: "2026-09-15T13:33:31Z", unsubscribeDetectedAt: null, billingIssuesDetectedAt: null } },
  );
  expect(infoFromCustomer(c)).toEqual({ plan: "family", productId: "family_monthly", expiresAt: "2026-09-15T13:33:31Z", willRenew: true });

  // A leftover subscription list without any active entitlement is Free.
  expect(infoFromCustomer(customer({}, ["monthly_2"]))).toMatchObject({ plan: "free" });
});
