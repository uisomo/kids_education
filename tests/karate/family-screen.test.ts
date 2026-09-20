// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { renderFamilyScreen } from "../../karate-trainer/src/ui/family-screen";

const members = [{ id: "m1", name: "じぶん" }, { id: "m2", name: "たろう" }];

function deps(over: Record<string, unknown> = {}) {
  return {
    members, activeId: "m1",
    onAddMember: vi.fn(), onRemoveMember: vi.fn(), onSelectMember: vi.fn(),
    activePlan: "free" as const, onSelectPlan: vi.fn(),
    ...over,
  };
}

it("lists members with the active one marked and a selector", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());
  expect(root.querySelectorAll("[data-member-row]")).toHaveLength(2);
  expect(root.querySelector(".family-member-row.active")!.getAttribute("data-member-row")).toBe("m1");
  const sel = root.querySelector<HTMLSelectElement>("[data-member-select]")!;
  expect(sel.value).toBe("m1");
});

it("changing the selector fires onSelectMember", () => {
  const root = document.createElement("div");
  const onSelectMember = vi.fn();
  renderFamilyScreen(root, deps({ onSelectMember }));
  const sel = root.querySelector<HTMLSelectElement>("[data-member-select]")!;
  sel.value = "m2";
  sel.dispatchEvent(new Event("change"));
  expect(onSelectMember).toHaveBeenCalledWith("m2");
});

it("adding a member fires onAddMember with the typed name", () => {
  const root = document.createElement("div");
  const onAddMember = vi.fn();
  renderFamilyScreen(root, deps({ onAddMember }));
  const input = root.querySelector<HTMLInputElement>("[data-member-add-input]")!;
  input.value = "はなこ";
  root.querySelector<HTMLButtonElement>("[data-member-add]")!.click();
  expect(onAddMember).toHaveBeenCalledWith("はなこ");
});

it("removing a member fires onRemoveMember; last member's delete is disabled", () => {
  const root = document.createElement("div");
  const onRemoveMember = vi.fn();
  renderFamilyScreen(root, deps({ onRemoveMember }));
  root.querySelector<HTMLButtonElement>('[data-member-del="m2"]')!.click();
  expect(onRemoveMember).toHaveBeenCalledWith("m2");

  // single-member list → delete disabled
  const root2 = document.createElement("div");
  renderFamilyScreen(root2, deps({ members: [{ id: "m1", name: "じぶん" }] }));
  expect(root2.querySelector<HTMLButtonElement>('[data-member-del="m1"]')!.disabled).toBe(true);
});

it("renders a plan card per plan with the active member's plan marked", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ activePlan: "premium" }));
  const cards = root.querySelectorAll("[data-plan-card]");
  expect(cards).toHaveLength(3);   // free / premium / family
  expect(root.querySelector('[data-plan-card="premium"]')!.classList.contains("active")).toBe(true);
  expect(root.querySelector('[data-plan-card="free"]')!.classList.contains("active")).toBe(false);
});

it("shows monthly and yearly prices and each plan's kid limit", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ activePlan: "family" }));
  const fam = root.querySelector('[data-plan-card="family"]')!;
  expect(fam.classList.contains("active")).toBe(true);
  expect(fam.querySelector(".family-plan-price")!.textContent).toBe("¥1,500/月");
  expect(fam.querySelector(".family-plan-yearly")!.textContent).toContain("¥15,000/年");
  expect(fam.querySelector(".family-plan-feats")!.textContent).toContain("5人まで");
  const prem = root.querySelector('[data-plan-card="premium"]')!;
  expect(prem.querySelector(".family-plan-price")!.textContent).toBe("¥1,000/月");
  expect(prem.querySelector(".family-plan-yearly")!.textContent).toContain("¥10,000/年");
  expect(root.querySelector('[data-plan-card="free"] .family-plan-yearly')).toBeNull();
});

it("locks members past the plan's kid limit and disables adding", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ memberCap: 1 }));
  expect(root.querySelector('[data-member-row="m1"]')!.classList.contains("locked")).toBe(false);
  expect(root.querySelector('[data-member-row="m2"]')!.classList.contains("locked")).toBe(true);
  expect(root.querySelector<HTMLOptionElement>('[data-member-select] option[value="m2"]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>("[data-member-add]")!.disabled).toBe(true);
  expect(root.querySelector<HTMLElement>("[data-member-hint]")!.hidden).toBe(false);
});

it("allows adding while under the kid limit", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ memberCap: 5 }));
  expect(root.querySelector(".family-member-row.locked")).toBeNull();
  expect(root.querySelector<HTMLButtonElement>("[data-member-add]")!.disabled).toBe(false);
  expect(root.querySelector<HTMLElement>("[data-member-hint]")!.hidden).toBe(true);
});

it("tapping a plan card fires onSelectPlan with that plan", () => {
  const root = document.createElement("div");
  const onSelectPlan = vi.fn();
  renderFamilyScreen(root, deps({ activePlan: "free", onSelectPlan }));
  root.querySelector<HTMLButtonElement>('[data-plan-card="family"]')!.click();
  expect(onSelectPlan).toHaveBeenCalledWith("family");
});

// --- E3: くらす assignment section ---
const classes = [
  { id: "p1", name: "基礎", menu: [] },
  { id: "p2", name: "応用", menu: [] },
];

function classDeps(over: Record<string, unknown> = {}) {
  return deps({
    classes,
    assignments: { m1: "p1", m2: null },
    onAssignClass: vi.fn(),
    ...over,
  });
}

it("shows the メニュー select only for the member picked in 設定したいメンバー", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, classDeps());
  expect(root.querySelectorAll("[data-class-row]")).toHaveLength(1);
  expect(root.querySelector<HTMLSelectElement>('[data-class-select="m1"]')!.value).toBe("p1");
  expect(root.querySelector('[data-class-select="m2"]')).toBeNull();
  expect(root.textContent).not.toContain("くらす");

  const other = document.createElement("div");
  renderFamilyScreen(other, classDeps({ activeId: "m2" }));
  expect(other.querySelector<HTMLSelectElement>('[data-class-select="m2"]')!.value).toBe("");   // なし
});

it("changing a member's class fires onAssignClass with the preset id", () => {
  const root = document.createElement("div");
  const onAssignClass = vi.fn();
  renderFamilyScreen(root, classDeps({ onAssignClass }));
  const m1 = root.querySelector<HTMLSelectElement>('[data-class-select="m1"]')!;
  m1.value = "p2";
  m1.dispatchEvent(new Event("change"));
  expect(onAssignClass).toHaveBeenCalledWith("m1", "p2");
});

it("selecting なし fires onAssignClass with null", () => {
  const root = document.createElement("div");
  const onAssignClass = vi.fn();
  renderFamilyScreen(root, classDeps({ onAssignClass }));
  const m1 = root.querySelector<HTMLSelectElement>('[data-class-select="m1"]')!;
  m1.value = "";
  m1.dispatchEvent(new Event("change"));
  expect(onAssignClass).toHaveBeenCalledWith("m1", null);
});

it("shows a hint instead of selects when there are no saved menus", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, classDeps({ classes: [], assignments: {} }));
  expect(root.querySelector("[data-class-hint]")).not.toBeNull();
  expect(root.querySelectorAll("[data-class-select]")).toHaveLength(0);
});

it("omits the class section entirely for pre-E3 callers", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());   // no classes/assignments/onAssignClass
  expect(root.querySelector("[data-class-list]")).toBeNull();
  expect(root.querySelector("[data-class-hint]")).toBeNull();
});

// --- おたより section (per active member) ---
const LETTERS = [
  { id: "L2", text: "がんばってるね", by: "パパ", createdAt: 2000 },
  { id: "L1", text: "きのうも えらかった", by: "ママ", createdAt: 1000, readAt: 1500 },
];

function letterDeps(over: Record<string, unknown> = {}) {
  return deps({
    letters: LETTERS,
    onSendLetter: vi.fn(),
    ...over,
  });
}

it("renders an empty おたより box (sending does not overwrite the last one)", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, letterDeps());
  const text = root.querySelector<HTMLInputElement>("[data-letter-text]")!;
  expect(text.value).toBe("");
  // The signature carries over from the newest letter, so it is typed once.
  expect(root.querySelector<HTMLInputElement>("[data-letter-by]")!.value).toBe("パパ");
});

it("おくる fires onSendLetter with the text and the signature", () => {
  const root = document.createElement("div");
  const onSendLetter = vi.fn();
  renderFamilyScreen(root, letterDeps({ onSendLetter }));
  root.querySelector<HTMLInputElement>("[data-letter-text]")!.value = "だいすき";
  root.querySelector<HTMLInputElement>("[data-letter-by]")!.value = "ママ";
  root.querySelector<HTMLButtonElement>("[data-letter-send]")!.click();
  expect(onSendLetter).toHaveBeenCalledWith("だいすき", "ママ");
});

it("おくる on an empty box sends nothing", () => {
  const root = document.createElement("div");
  const onSendLetter = vi.fn();
  renderFamilyScreen(root, letterDeps({ onSendLetter }));
  root.querySelector<HTMLInputElement>("[data-letter-text]")!.value = "   ";
  root.querySelector<HTMLButtonElement>("[data-letter-send]")!.click();
  expect(onSendLetter).not.toHaveBeenCalled();
});

it("lists the letters already sent with whether the kid read them", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, letterDeps());
  const items = root.querySelectorAll("[data-letter]");
  expect(items).toHaveLength(2);
  expect(items[0].querySelector("[data-letter-state]")!.textContent).toBe("まだ");
  expect(items[0].textContent).toContain("がんばってるね");
  expect(items[1].querySelector("[data-letter-state]")!.textContent).toBe("よんだ");
});

it("けす removes one sent letter", () => {
  const root = document.createElement("div");
  const onDeleteLetter = vi.fn();
  renderFamilyScreen(root, letterDeps({ onDeleteLetter }));
  root.querySelector<HTMLButtonElement>('[data-letter-delete="L1"]')!.click();
  expect(onDeleteLetter).toHaveBeenCalledWith("L1");
});

it("omits the おたより section for callers without letter wiring", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());   // no letters/onSendLetter
  expect(root.querySelector("[data-letter-text]")).toBeNull();
  expect(root.querySelector("[data-letter-sent]")).toBeNull();
});

// --- 帯 section (parent-controlled) ---
it("lets the parent pick the active member's belt for each saved menu", () => {
  const root = document.createElement("div");
  const onSetMenuBelt = vi.fn();
  renderFamilyScreen(root, deps({
    menuBelts: [{ id: "p1", name: "基本", belt: 11 }, { id: "p2", name: "型", belt: 0 }],
    onSetMenuBelt,
  }));
  expect(root.querySelector('[data-belt-row="p1"]')!.textContent).toContain("基本");
  const s1 = root.querySelector<HTMLSelectElement>('[data-belt-select="p1"]')!;
  expect(s1.value).toBe("11");
  expect(s1.options).toHaveLength(14);
  const s2 = root.querySelector<HTMLSelectElement>('[data-belt-select="p2"]')!;
  s2.value = "12";
  s2.dispatchEvent(new Event("change"));
  expect(onSetMenuBelt).toHaveBeenCalledWith("p2", 12);
});

it("omits the belt section without belt wiring", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());
  expect(root.querySelector("[data-belt-list]")).toBeNull();
});

it("the おたより box says how long a letter can be and how many are kept", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, letterDeps());
  const note = root.querySelector(".family-comment-note")!;
  expect(note.textContent).toContain("60文字まで");
  expect(note.textContent).toContain("5通");
});

it("manages members first, then frames the picked member's settings, then the plan", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({
    classes: [{ id: "p1", name: "基本", menu: [] }], assignments: { m1: "p1" }, onAssignClass: vi.fn(),
    letters: [], onSendLetter: vi.fn(),
  }));
  const labels = [...root.querySelectorAll(".family-section-label, .family-label")].map((e) => e.textContent);
  expect(labels[0]).toBe("メンバーを管理する");
  const box = root.querySelector("[data-member-settings]")!;
  expect(box.textContent).toContain("設定したいメンバー");
  expect(box.querySelector("[data-class-select]")).not.toBeNull();
  expect(box.querySelector("[data-letter-text]")).not.toBeNull();
  expect(box.querySelector("[data-plan-cards]")).toBeNull();
  const listPos = root.querySelector("[data-member-list]")!.compareDocumentPosition(box);
  expect(listPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("a member name can be changed with 変更", () => {
  const root = document.createElement("div");
  const onRenameMember = vi.fn();
  renderFamilyScreen(root, deps({ onRenameMember }));
  const input = root.querySelector<HTMLInputElement>('[data-member-name="m2"]')!;
  const button = root.querySelector<HTMLButtonElement>('[data-member-rename="m2"]')!;
  expect(input.value).toBe("たろう");
  expect(button.disabled).toBe(true);
  input.value = "  じろう ";
  input.dispatchEvent(new Event("input"));
  expect(button.disabled).toBe(false);
  button.click();
  expect(onRenameMember).toHaveBeenCalledWith("m2", "じろう");
});

it("plan cards list menus and 工夫, per kid on Family", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());
  const feats = (plan: string) => root.querySelector(`[data-plan-card="${plan}"] .family-plan-feats`)!.textContent!;
  expect(feats("free")).toContain("メニュー 1");
  expect(feats("premium")).toContain("メニュー 5");
  expect(feats("premium")).toContain("工夫 150");
  expect(feats("family")).toContain("メニュー 5/人");
  expect(feats("family")).toContain("工夫 150/人");
  expect(feats("free")).not.toContain("キャラなし動画");
  expect(feats("premium")).toContain("キャラなし動画");
  expect(feats("family")).toContain("キャラなし動画");
});

it("「工夫をぜんぶけす」 shows the count and asks the app to clear; disabled with none", () => {
  const root = document.createElement("div");
  const onClearAllKufu = vi.fn();
  renderFamilyScreen(root, deps({ kufuCount: 4, onClearAllKufu }));
  const btn = root.querySelector<HTMLButtonElement>("[data-kufu-clear-all]")!;
  expect(btn.textContent).toContain("4件");
  btn.click();
  expect(onClearAllKufu).toHaveBeenCalledOnce();

  const none = document.createElement("div");
  renderFamilyScreen(none, deps({ kufuCount: 0, onClearAllKufu }));
  expect(none.querySelector<HTMLButtonElement>("[data-kufu-clear-all]")!.disabled).toBe(true);
});

it("LINE・SNS: a checkbox for the picked member reports changes", () => {
  const root = document.createElement("div");
  const onSetShareAllowed = vi.fn();
  renderFamilyScreen(root, deps({ activeId: "m2", shareAllowed: { m1: true, m2: false }, onSetShareAllowed }));
  expect(root.querySelector('[data-share-allowed="m1"]')).toBeNull();
  const m2 = root.querySelector<HTMLInputElement>('[data-share-allowed="m2"]')!;
  expect(m2.checked).toBe(false);
  expect(root.querySelector('[data-share-row="m2"]')!.textContent).toContain("LINE・SNSで送るボタンを表示する");
  m2.checked = true;
  m2.dispatchEvent(new Event("change"));
  expect(onSetShareAllowed).toHaveBeenCalledWith("m2", true);
});

// --- App Store mode (billing) ---
function billingView(over: Record<string, unknown> = {}) {
  return {
    prices: { premium_monthly: "¥980", premium_yearly: "¥9,800", family_monthly: "¥1,480", family_yearly: "¥14,800" },
    currentProduct: null, renewal: "", busy: false, status: "",
    onBuy: vi.fn(), onRestore: vi.fn(), onManage: vi.fn(), onChooseFree: vi.fn(),
    ...over,
  };
}

it("billing: paid cards offer 月 and 年 at the store's prices and buy that product", () => {
  const root = document.createElement("div");
  const billing = billingView();
  const onSelectPlan = vi.fn();
  renderFamilyScreen(root, deps({ billing, onSelectPlan }));
  const buy = (id: string) => root.querySelector<HTMLButtonElement>(`[data-buy="${id}"]`)!;
  expect(buy("premium_monthly").textContent).toBe("¥980/月");
  expect(buy("family_yearly").textContent).toBe("¥14,800/年");
  expect(root.querySelector('[data-plan-card="free"] [data-buy]')).toBeNull();
  buy("family_monthly").click();
  expect(billing.onBuy).toHaveBeenCalledWith("family_monthly");
  // The card itself no longer switches the plan.
  root.querySelector<HTMLElement>('[data-plan-card="family"]')!.click();
  expect(onSelectPlan).not.toHaveBeenCalled();
});

it("billing: loading, unavailable and current products can't be bought", () => {
  const loading = document.createElement("div");
  renderFamilyScreen(loading, deps({ billing: billingView({ prices: null }) }));
  const l = loading.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!;
  expect(l.textContent).toBe("…");
  expect(l.disabled).toBe(true);

  const root = document.createElement("div");
  renderFamilyScreen(root, deps({
    activePlan: "premium",
    billing: billingView({ prices: { premium_monthly: "¥980", premium_yearly: "¥9,800" }, currentProduct: "premium_monthly" }),
  }));
  const cur = root.querySelector<HTMLButtonElement>('[data-buy="premium_monthly"]')!;
  expect(cur.textContent).toBe("✓ ¥980/月");
  expect(cur.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>('[data-buy="premium_yearly"]')!.disabled).toBe(false);
  const missing = root.querySelector<HTMLButtonElement>('[data-buy="family_monthly"]')!;
  expect(missing.textContent).toBe("—");
  expect(missing.disabled).toBe(true);
});

it("billing: busy disables buying and restoring and says so", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ activePlan: "premium", billing: billingView({ busy: true }) }));
  expect(root.querySelector<HTMLButtonElement>('[data-buy="family_monthly"]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>("[data-restore]")!.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>("[data-choose-free]")!.disabled).toBe(true);
  expect(root.querySelector("[data-billing-status]")!.textContent).toContain("通信中");
});

it("billing: Free explains cancelling, and restore / manage / status / renewal show", () => {
  const root = document.createElement("div");
  const billing = billingView({ status: "プレミアムを復元しました", renewal: "2026/10/15 に自動更新", currentProduct: "premium_yearly" });
  renderFamilyScreen(root, deps({ activePlan: "premium", billing }));
  root.querySelector<HTMLButtonElement>("[data-choose-free]")!.click();
  expect(billing.onChooseFree).toHaveBeenCalledOnce();
  root.querySelector<HTMLButtonElement>("[data-restore]")!.click();
  expect(billing.onRestore).toHaveBeenCalledOnce();
  root.querySelector<HTMLButtonElement>("[data-manage]")!.click();
  expect(billing.onManage).toHaveBeenCalledOnce();
  expect(root.querySelector("[data-billing-status]")!.textContent).toBe("プレミアムを復元しました");
  expect(root.querySelector<HTMLElement>("[data-billing-renewal]")!.hidden).toBe(false);

  // On Free there's nothing to switch to Free.
  const free = document.createElement("div");
  renderFamilyScreen(free, deps({ billing: billingView() }));
  expect(free.querySelector("[data-choose-free]")).toBeNull();
  expect(free.querySelector<HTMLElement>("[data-billing-status]")!.hidden).toBe(true);
});

it("billing: shows the auto-renewal terms with a Terms of Use link", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps({ billing: billingView() }));
  const legal = root.querySelector("[data-billing-legal]")!;
  expect(legal.textContent).toContain("自動更新");
  expect(legal.textContent).toContain("24時間前");
  const terms = [...legal.querySelectorAll("a")].find((a) => a.textContent === "利用規約")!;
  expect(terms.getAttribute("href")).toContain("apple.com");
});

it("without billing there are no buy buttons or subscription terms", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());
  expect(root.querySelector("[data-buy]")).toBeNull();
  expect(root.querySelector("[data-restore]")).toBeNull();
  expect(root.querySelector("[data-billing-legal]")).toBeNull();
});

it("hides the かざり section when the caller doesn't pass one", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());
  expect(root.querySelector("[data-decor-options]")).toBeNull();
});

it("marks the chosen かざり and fires onSelectDecor", () => {
  const root = document.createElement("div");
  const onSelectDecor = vi.fn();
  renderFamilyScreen(root, deps({ decor: "banner", onSelectDecor, canRemoveDecor: true }));
  const options = root.querySelectorAll("[data-decor-options] .decor-option");
  expect(options).toHaveLength(4);
  expect(root.querySelector('.decor-option[data-decor="banner"]')!.classList.contains("on")).toBe(true);
  root.querySelector<HTMLButtonElement>('.decor-option[data-decor="icon"]')!.click();
  expect(onSelectDecor).toHaveBeenCalledWith("icon");
});

it("locks 「なし」 on a free household and leaves the rest usable", () => {
  const root = document.createElement("div");
  const onSelectDecor = vi.fn();
  renderFamilyScreen(root, deps({ decor: "frame", onSelectDecor, canRemoveDecor: false }));
  const none = root.querySelector<HTMLButtonElement>('.decor-option[data-decor="none"]')!;
  expect(none.disabled).toBe(true);
  expect(none.textContent).toContain("プレミアム");
  none.click();
  expect(onSelectDecor).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>('.decor-option[data-decor="frame"]')!.click();
  expect(onSelectDecor).toHaveBeenCalledWith("frame");
});

it("a paid household can pick 「なし」", () => {
  const root = document.createElement("div");
  const onSelectDecor = vi.fn();
  renderFamilyScreen(root, deps({ decor: "none", onSelectDecor, canRemoveDecor: true }));
  const none = root.querySelector<HTMLButtonElement>('.decor-option[data-decor="none"]')!;
  expect(none.disabled).toBe(false);
  expect(none.classList.contains("on")).toBe(true);
  none.click();
  expect(onSelectDecor).toHaveBeenCalledWith("none");
});
