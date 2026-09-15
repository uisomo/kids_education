// @vitest-environment jsdom
// App Store subscriptions: the plan follows Apple (via the injected Billing),
// never a tap on a plan card.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { getActiveId, loadMembers } from "../../karate-trainer/src/member-store";
import { loadPlan } from "../../karate-trainer/src/plan-store";
import type { Billing, BillingInfo, PurchaseOutcome } from "../../karate-trainer/src/billing";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  document.body.textContent = "";
});

const FREE: BillingInfo = { plan: "free", productId: null, expiresAt: null, willRenew: false };
const info = (plan: "premium" | "family", productId: string): BillingInfo =>
  ({ plan, productId, expiresAt: "2026-10-15T00:00:00Z", willRenew: true });

function fakeBilling(start: BillingInfo | null) {
  let listener: ((i: BillingInfo) => void) | null = null;
  const billing = {
    refresh: vi.fn(async () => start),
    prices: vi.fn(async () => ({ premium_monthly: "¥980", premium_yearly: "¥9,800", family_monthly: "¥1,480", family_yearly: "¥14,800" })),
    purchase: vi.fn(async (): Promise<PurchaseOutcome> => ({ status: "cancelled" })),
    restore: vi.fn(async (): Promise<BillingInfo | null> => FREE),
    manage: vi.fn(async () => {}),
    onChange: vi.fn((cb: (i: BillingInfo) => void) => { listener = cb; }),
  } satisfies Billing;
  return { billing, emit: (i: BillingInfo) => listener!(i) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function makeApp(billing: Billing, storage = memStorage(), confirm = vi.fn(() => true)) {
  const root = document.createElement("div");
  document.body.append(root);
  const store = new VoiceStore(memKv());
  await store.init();
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    confirm,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
    billing,
  });
  await app.start();
  await flush();
  const openFamily = () => {
    root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
    const [a, b] = root.querySelector("[data-gate-question]")!.textContent!.match(/\d+/g)!.map(Number);
    root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(a * b);
    root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
  };
  const status = () => root.querySelector("[data-billing-status]")!.textContent;
  return { app, root, storage, openFamily, status };
}

it("the plan comes from Apple at launch, replacing the cached one", async () => {
  const storage = memStorage();
  storage.setItem("karate.householdPlan", "premium");   // left over from the old mock picker
  const { billing } = fakeBilling(FREE);
  await makeApp(billing, storage);
  expect(loadPlan(storage)).toBe("free");

  const paid = fakeBilling(info("family", "family_yearly"));
  const s2 = memStorage();
  const { root, openFamily } = await makeApp(paid.billing, s2);
  expect(loadPlan(s2)).toBe("family");
  openFamily();
  expect(root.querySelector("[data-billing-renewal]")!.textContent).toBe("2026/10/15 に自動更新");
  expect(root.querySelector<HTMLButtonElement>('[data-buy="family_yearly"]')!.disabled).toBe(true);
});

it("keeps the cached plan when the store can't be reached", async () => {
  const storage = memStorage();
  storage.setItem("karate.householdPlan", "family");
  const { billing } = fakeBilling(null);
  await makeApp(billing, storage);
  expect(loadPlan(storage)).toBe("family");
});

it("buying switches the plan only once Apple confirms it", async () => {
  const { billing } = fakeBilling(FREE);
  const { root, storage, openFamily, status } = await makeApp(billing);
  openFamily();
  expect(root.querySelector('[data-buy="premium_monthly"]')!.textContent).toBe("¥980/月");

  // Cancelled in Apple's sheet: nothing changes, nothing to say.
  root.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!.click();
  await flush();
  expect(billing.purchase).toHaveBeenCalledWith("premium_monthly");
  expect(loadPlan(storage)).toBe("free");
  expect(status()).toBe("");

  // Failure: plan unchanged, a message.
  billing.purchase.mockResolvedValueOnce({ status: "error", message: "network" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  root.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!.click();
  await flush();
  expect(loadPlan(storage)).toBe("free");
  expect(status()).toContain("購入できませんでした");

  // Success.
  billing.purchase.mockResolvedValueOnce({ status: "purchased", info: info("premium", "premium_monthly") });
  root.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!.click();
  expect(root.querySelector<HTMLButtonElement>("[data-restore]")!.disabled).toBe(true);   // busy
  await flush();
  expect(loadPlan(storage)).toBe("premium");
  expect(status()).toContain("プレミアムになりました");
  expect(root.querySelector('[data-plan-card="premium"]')!.classList.contains("active")).toBe(true);
});

it("a downgrade bought on Family waits for the next renewal", async () => {
  const { billing } = fakeBilling(info("family", "family_monthly"));
  billing.purchase.mockResolvedValueOnce({ status: "purchased", info: info("family", "family_monthly") });
  const { root, storage, openFamily, status } = await makeApp(billing);
  openFamily();
  root.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!.click();
  await flush();
  expect(loadPlan(storage)).toBe("family");
  expect(status()).toContain("次の更新日から");
});

it("Ask to Buy shows as pending", async () => {
  const { billing } = fakeBilling(FREE);
  billing.purchase.mockResolvedValueOnce({ status: "pending" });
  const { root, openFamily, status } = await makeApp(billing);
  openFamily();
  root.querySelector<HTMLButtonElement>('[data-buy="family_monthly"]')!.click();
  await flush();
  expect(status()).toContain("承認待ち");
});

it("an expiry locks the extra kids without deleting them", async () => {
  const { billing, emit } = fakeBilling(info("family", "family_monthly"));
  const { root, storage, openFamily } = await makeApp(billing);
  const first = getActiveId(storage);
  openFamily();
  root.querySelector<HTMLInputElement>("[data-member-add-input]")!.value = "たろう";
  root.querySelector<HTMLButtonElement>("[data-member-add]")!.click();
  expect(getActiveId(storage)).not.toBe(first);

  emit(FREE);
  expect(loadPlan(storage)).toBe("free");
  expect(loadMembers(storage)).toHaveLength(2);
  expect(getActiveId(storage)).toBe(first);
  expect(root.querySelector(".family-member-row.locked")).not.toBeNull();
});

it("a change during a practice waits for the setup screen", async () => {
  const { billing, emit } = fakeBilling(info("family", "family_monthly"));
  const { app, root, storage } = await makeApp(billing);
  (app as unknown as { videoRecorder: unknown }).videoRecorder = {};   // session running
  emit(FREE);
  expect(loadPlan(storage)).toBe("family");
  (app as unknown as { videoRecorder: unknown }).videoRecorder = null;
  root.querySelector<HTMLButtonElement>('[data-navtab="strength"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  expect(loadPlan(storage)).toBe("free");
});

it("restore reports what it found, and Free points to Apple's manage page", async () => {
  const { billing } = fakeBilling(info("premium", "premium_yearly"));
  const confirm = vi.fn(() => true);
  const { root, storage, openFamily, status } = await makeApp(billing, memStorage(), confirm);
  openFamily();

  root.querySelector<HTMLButtonElement>("[data-restore]")!.click();
  await flush();
  expect(status()).toContain("見つかりませんでした");
  expect(loadPlan(storage)).toBe("free");

  billing.restore.mockResolvedValueOnce(info("family", "family_yearly"));
  root.querySelector<HTMLButtonElement>("[data-restore]")!.click();
  await flush();
  expect(status()).toBe("ファミリーを復元しました");
  expect(loadPlan(storage)).toBe("family");

  root.querySelector<HTMLButtonElement>("[data-choose-free]")!.click();
  expect(confirm).toHaveBeenCalled();
  expect(billing.manage).toHaveBeenCalledOnce();
  expect(loadPlan(storage)).toBe("family");   // tapping Free doesn't cancel anything itself

  root.querySelector<HTMLButtonElement>("[data-manage]")!.click();
  expect(billing.manage).toHaveBeenCalledTimes(2);

  // Leaving 家族 clears the message.
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  openFamily();
  expect(status()).toBe("");
});
