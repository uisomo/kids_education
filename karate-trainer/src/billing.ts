// 課金（App Store のサブスク）。しくみは シリーズ共通の alan-billing（アランの基盤 packages/billing。
// SERIES_GUIDE 5.8・5.8b・5.8c）。ここは 空手／ピアノの うすい つつみ。
//
// - プランは Apple（RevenueCat）が 買ったと いうもの だけ。UI の タップでは かわらない。
//   plan-store は さいごに わかった プランの キャッシュ（オフラインでも 上限は そのまま）
// - アランのスイート（どの アランの アプリで 買っても）は ファミリーと おなじ（子ども 5人）
// - 商品ID：空手は 前ぶん なし（premium_monthly …）、ピアノは piano_、スイートは <app>_suite_<period>。
//   RevenueCat の offering の package の 名前は アプリの中の 名前（premium_monthly … suite_yearly）

import {
  type AppKey, type Billing, type BillingInfo, type Period, type ProductId, type PurchaseOutcome,
  createSeriesBilling, MANAGE_URL, openExternal, productId, renewalText, TERMS_URL, trialLength,
} from "./alan/alan-billing.js";
import type { Plan } from "./plan-store";
import { IS_PIANO } from "./flavor";
import { TEST_MODE } from "./test-mode";

export type { Billing, BillingInfo, Period, ProductId, PurchaseOutcome };
export type PaidPlan = Exclude<Plan, "free">;
export { MANAGE_URL, productId, renewalText, TERMS_URL, trialLength };

/** この アプリの key（alan-billing の APPS）。 */
export const APP_KEY: AppKey = IS_PIANO ? "piano" : "karate";

// アプリごとの プライバシーポリシー（ピアノは karate-trainer/piano-site/）。
export const PRIVACY_URL = IS_PIANO ? "https://alan-piano.pages.dev/privacy" : "https://karate-trainer.pages.dev/privacy";

// RevenueCat の Test Store で むかし 作った 商品（monthly / yearly＝プレミアム、monthly_2 / yearly_2＝ファミリー）。
const STORE_ALIASES: Record<string, ProductId> = {
  monthly: "premium_monthly",
  yearly: "premium_yearly",
  monthly_2: "family_monthly",
  yearly_2: "family_yearly",
};

/** シリーズの 課金。planKey は むかしからの karate.householdPlan（ピアノも おなじ 名前。べつの アプリなので まざらない）。 */
export const series = createSeriesBilling({
  app: APP_KEY,
  apiKey: import.meta.env.VITE_REVENUECAT_API_KEY ?? "",
  testBuild: TEST_MODE,
  loadSdk: () => import("@revenuecat/purchases-capacitor").then((m) => m.Purchases),
  aliases: STORE_ALIASES,
  planKey: "karate.householdPlan",
});

/** お店の 商品ID → アプリの中の 名前（この アプリの もの と、どの アプリの スイート）。 */
export const toProductId = series.toProductId;

/** premium_monthly → premium（アプリの中の 名前でも、お店の 商品IDでも）。 */
export function planOfProduct(raw: string): Plan {
  const id = /^(premium|family|suite)_(monthly|yearly)$/.test(raw) ? raw : series.toProductId(raw);
  const plan = id?.split("_")[0];
  return plan === "premium" || plan === "family" || plan === "suite" ? plan : "free";
}

/** iPhone の アプリの 課金。テスト版は お店に つながない（プランの カードで 切りかえ）→ undefined。
 *  キーが ない 本番ビルドでも「売らない」課金を かえす（ない と カードで ただで プランが かえられて しまう）。 */
export function appBilling(isNative: boolean): Billing | undefined {
  if (!isNative || TEST_MODE) return undefined;
  return series.billing ?? unconfiguredBilling();
}

function unconfiguredBilling(): Billing {
  return {
    refresh: async () => null,
    prices: async () => ({}),
    trials: async () => ({}),
    purchase: async () => ({ status: "error", message: "RevenueCat API key is not set" }),
    restore: async () => null,
    manage: async () => openExternal(MANAGE_URL),
    onChange: () => { /* なにも かわらない */ },
  };
}
