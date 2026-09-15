// Billing on the iOS app through RevenueCat (StoreKit underneath). The plugin
// is imported lazily so the web build and the tests never load it.
//
// apiKey: the RevenueCat public SDK key — appl_… for the App Store, test_… for
// RevenueCat's Test Store (works before App Store Connect is set up; debug
// builds only). An empty key means "not set up yet": nothing is for sale.

import type { CustomerInfo, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import {
  type Billing, type BillingInfo, type ProductId,
  MANAGE_URL, PRODUCT_IDS, planFromEntitlements, planOfProduct, toProductId,
} from "./billing";

type Sdk = typeof import("@revenuecat/purchases-capacitor");

const RANK = { free: 0, premium: 1, family: 2 } as const;

// The plan is read from the products the household is subscribed to, so one
// entitlement holding all four works (the RevenueCat project has a single
// アランの空手_pro). Several can be active at once — the Test Store has no
// subscription groups, and Apple keeps the old plan until a downgrade's
// renewal — and an entitlement only names one of them, so the highest plan
// among all active subscriptions wins. Entitlements named premium / family
// count too. No active entitlement means Free.
export function infoFromCustomer(customer: CustomerInfo): BillingInfo {
  let best: BillingInfo = { plan: "free", productId: null, expiresAt: null, willRenew: false };
  const entitlements = Object.values(customer.entitlements.active);
  if (entitlements.length === 0) return best;
  const offer = (plan: BillingInfo["plan"], rest: Omit<BillingInfo, "plan">) => {
    if (RANK[plan] > RANK[best.plan]) best = { plan, ...rest };
  };

  const storeIds = new Set([...(customer.activeSubscriptions ?? []), ...entitlements.map((e) => e.productIdentifier)]);
  for (const storeId of storeIds) {
    const id = toProductId(storeId);
    if (!id) continue;
    const ent = entitlements.find((e) => e.productIdentifier === storeId);
    const sub = customer.subscriptionsByProductIdentifier?.[storeId];
    offer(planOfProduct(id), {
      productId: id,
      expiresAt: sub?.expiresDate ?? ent?.expirationDate ?? null,
      willRenew: ent ? ent.willRenew : !!sub && sub.unsubscribeDetectedAt === null && sub.billingIssuesDetectedAt === null,
    });
  }
  for (const [name, ent] of Object.entries(customer.entitlements.active)) {
    offer(planFromEntitlements([name]), {
      productId: toProductId(ent.productIdentifier) ?? ent.productIdentifier,
      expiresAt: ent.expirationDate,
      willRenew: ent.willRenew,
    });
  }
  return best;
}

// The native plugin rejects with { message, code } where code is a
// PURCHASES_ERROR_CODE string ("1" = cancelled, "20" = payment pending).
function errorCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
}

function openExternal(url: string): void {
  // Capacitor hands target=_blank navigations to iOS, which opens the App
  // Store's subscription page (or Safari) outside the app.
  window.open(url, "_blank");
}

export function makeRevenueCatBilling(apiKey: string): Billing {
  if (!apiKey) return unconfiguredBilling();

  let sdkPromise: Promise<Sdk> | null = null;
  const sdk = (): Promise<Sdk> => {
    sdkPromise ??= (async () => {
      const mod = await import("@revenuecat/purchases-capacitor");
      if (apiKey.startsWith("test_")) await mod.Purchases.setLogLevel({ level: mod.LOG_LEVEL.DEBUG });
      await mod.Purchases.configure({ apiKey });
      return mod;
    })().catch((e) => { sdkPromise = null; throw e; });   // retry next call
    return sdkPromise;
  };

  let packages: Map<string, PurchasesPackage> | null = null;
  const loadPackages = async (): Promise<Map<string, PurchasesPackage>> => {
    const { Purchases } = await sdk();
    const offerings = await Purchases.getOfferings();
    const map = new Map<string, PurchasesPackage>();
    for (const pkg of offerings.current?.availablePackages ?? []) {
      const id = toProductId(pkg.product.identifier);
      if (id) map.set(id, pkg);
      else console.warn(`[billing] offering has an unknown product: ${pkg.product.identifier}`);
    }
    packages = map;
    return map;
  };

  const listeners: ((info: BillingInfo) => void)[] = [];
  let listening = false;
  const listen = async (): Promise<void> => {
    if (listening) return;
    listening = true;
    try {
      const { Purchases } = await sdk();
      await Purchases.addCustomerInfoUpdateListener((customer) => {
        const info = infoFromCustomer(customer);
        listeners.forEach((cb) => cb(info));
      });
    } catch {
      listening = false;
    }
  };

  return {
    async refresh() {
      try {
        const { Purchases } = await sdk();
        const { customerInfo } = await Purchases.getCustomerInfo();
        return infoFromCustomer(customerInfo);
      } catch {
        return null;
      }
    },

    async prices() {
      const out: Partial<Record<ProductId, string>> = {};
      try {
        const map = await loadPackages();
        for (const id of PRODUCT_IDS) {
          const pkg = map.get(id);
          if (pkg) out[id] = pkg.product.priceString;
        }
      } catch {
        /* offline or not set up: nothing for sale */
      }
      return out;
    },

    async purchase(id) {
      try {
        const map = packages?.has(id) ? packages : await loadPackages();
        const pkg = map.get(id);
        if (!pkg) return { status: "error", message: `${id} is not in the current offering` };
        const { Purchases } = await sdk();
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
        return { status: "purchased", info: infoFromCustomer(customerInfo) };
      } catch (e) {
        const code = errorCode(e);
        if (code === "1") return { status: "cancelled" };
        if (code === "20") return { status: "pending" };
        return { status: "error", message: e instanceof Error ? e.message : String(e) };
      }
    },

    async restore() {
      try {
        const { Purchases } = await sdk();
        const { customerInfo } = await Purchases.restorePurchases();
        return infoFromCustomer(customerInfo);
      } catch {
        return null;
      }
    },

    async manage() {
      let url = MANAGE_URL;
      try {
        const { Purchases } = await sdk();
        const { customerInfo } = await Purchases.getCustomerInfo();
        url = customerInfo.managementURL ?? MANAGE_URL;
      } catch {
        /* fall back to Apple's page */
      }
      openExternal(url);
    },

    onChange(cb) {
      listeners.push(cb);
      void listen();
    },
  };
}

function unconfiguredBilling(): Billing {
  return {
    refresh: async () => null,
    prices: async () => ({}),
    purchase: async () => ({ status: "error", message: "RevenueCat API key is not set" }),
    restore: async () => null,
    manage: async () => openExternal(MANAGE_URL),
    onChange: () => { /* nothing ever changes */ },
  };
}
