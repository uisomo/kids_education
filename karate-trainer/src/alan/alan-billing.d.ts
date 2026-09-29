// alan-billing.js の 型。手で 書く（JS を かえたら ここも）。
export type Plan = "free" | "premium" | "family" | "suite";
export type PaidPlan = Exclude<Plan, "free">;
export type Period = "monthly" | "yearly";
export type ProductId = `${PaidPlan}_${Period}`;
export type AppKey = "karate" | "piano" | "kimochi" | "okane" | "eigo" | "voice" | "dotoku" | "kotoba";

export interface PlanInfo { label: string; members: number; rank: number; monthly: string | null; yearly: string | null }
export interface AppInfo { name: string; bundleId: string; prefix: string; brand: string; sells: PaidPlan[]; released: boolean }

export const PLAN_ORDER: Plan[];
export const PLANS: Record<Plan, PlanInfo>;
export const SUITE_PITCH: string;
export const TRIAL: { period: string; label: string };
export const SUITE_ENTITLEMENT: string;
export const APPS: Record<AppKey, AppInfo>;
export const PERIODS: Period[];
export const TERMS_URL: string;
export const MANAGE_URL: string;

export function productId(plan: PaidPlan, period: Period): ProductId;
export function storeProductId(app: AppKey, plan: PaidPlan, period: Period): string;
export function appEntitlement(app: AppKey): string;
export function parseStoreId(storeId: string): { app: AppKey; plan: PaidPlan; period: Period } | null;
export function productIdsFor(app: AppKey): ProductId[];
export function fallbackPrice(id: ProductId): string | null;
export function renewalText(info: BillingInfo | null): string;
export function trialLength(unit: string, count: number): string;
export function sharedUserId(): Promise<string | null>;
export function openExternal(url: string): void;

export interface BillingInfo {
  plan: Plan;
  productId: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  /** どの アプリで 買ったか（スイートを ほかの アプリで 買ったとき、その アプリ） */
  fromApp: AppKey | null;
}

export type PurchaseOutcome =
  | { status: "purchased"; info: BillingInfo }
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "error"; message: string };

export interface Billing {
  refresh(): Promise<BillingInfo | null>;
  prices(): Promise<Partial<Record<ProductId, string>>>;
  trials(): Promise<Partial<Record<ProductId, string>>>;
  purchase(id: ProductId): Promise<PurchaseOutcome>;
  restore(): Promise<BillingInfo | null>;
  manage(): Promise<void>;
  onChange(cb: (info: BillingInfo) => void): void;
}

export interface SeriesBilling {
  app: AppKey;
  appName: string;
  /** この アプリの プランの ならび（free から。売らない プランは ない） */
  sells: Plan[];
  productIds: ProductId[];
  loadPlan(): Plan;
  setPlan(plan: Plan): void;
  isPaid(): boolean;
  onPlanChange(fn: (plan: Plan) => void): () => void;
  members(plan?: Plan): number;
  toProductId(storeId: string): ProductId | null;
  infoFromCustomer(customer: unknown): BillingInfo;
  /** スイートを ほかの アプリで 買って いる とき その アプリ（おぼえている 値。お店の 返事の 前でも つかえる）。ほかは null */
  suiteFrom(): AppKey | null;
  /** お店に つながる とき だけ（iPhone で キーが ある・テスト版 でない） */
  billing: Billing | null;
}

export function createSeriesBilling(opts: {
  app: AppKey;
  apiKey?: string;
  testBuild?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadSdk?: () => Promise<any>;
  aliases?: Record<string, ProductId>;
  planKey?: string;
}): SeriesBilling;

export function planFeatures(app: AppKey, plan: Plan, content?: { free?: string[]; paid?: string[]; daily?: boolean; recording?: boolean }): string[];
export function suiteSaving(): string;
export function releasedApps(): AppKey[];
export function upgradeHint(app: AppKey, plan: Plan, noun?: string, opts?: { daily?: boolean }): string;
