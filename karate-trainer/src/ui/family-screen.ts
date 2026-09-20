// 家族 screen (Tower E). E1: member management — list members, add/remove, and
// select the active member via a dropdown. E2 (plans), E3 (class assignment),
// and E4 (応援コメント) build on this screen later.

import type { Member } from "../member-store";
import { buildHowtoSection, buildParentNote } from "./howto";
import type { Preset } from "../preset-store";
import { type Plan, PLAN_LIMITS, PLAN_META } from "../plan-store";
import { type Period, type ProductId, PRIVACY_URL, TERMS_URL, productId } from "../billing";
import { BELTS, BARS_PER_BELT } from "../belt-store";
import { type Decor, DECORS, DECOR_META, canRemoveDecor } from "../decor-store";
import { COMMENT_MAX_LEN, COMMENT_BY_MAX_LEN } from "../comment-store";

export interface FamilyDeps {
  members: Member[];
  activeId: string;
  onAddMember(name: string): void;
  onRemoveMember(id: string): void;
  // 「変更」 next to a name box. Absent → names are plain text.
  onRenameMember?(id: string, name: string): void;
  onSelectMember(id: string): void;
  activePlan: Plan;             // the household's plan (one plan covers every member)
  onSelectPlan(plan: Plan): void;
  // How many members the plan allows. Members past it are shown locked (kept,
  // not deleted) and adding is disabled. Optional: absent means no limit.
  memberCap?: number;
  // E3 くらす assignment. `classes` = the family-shared presets that can be
  // assigned; `assignments` maps memberId → assigned presetId (or null).
  // Optional so pre-E3 callers/tests keep working (section is hidden if absent).
  classes?: Preset[];
  assignments?: Record<string, string | null>;
  onAssignClass?(memberId: string, presetId: string | null): void;
  // 帯 (parent-controlled): the active member's belt per saved menu. Optional so
  // earlier callers/tests keep working (section is hidden if absent).
  menuBelts?: { id: string; name: string; belt: number }[];
  onSetMenuBelt?(presetId: string, index: number): void;
  // E4 応援コメント (parent, for the active member). `comments` = the active
  // member's saved 感想 / ファイト messages. Optional so pre-E4 callers/tests keep
  // working (section is hidden if either is absent). Free on every plan.
  comments?: { kansou: string; kansouBy?: string; fight: string };
  onSaveComment?(kind: "kansou" | "kansouBy" | "fight", text: string): void;
  // 「工夫をぜんぶけす」 for the active member. Section hidden if absent.
  // Per kid: may the done screen show 「LINE・SNSで送る」 (sent with no gate).
  // Section hidden if absent.
  shareAllowed?: Record<string, boolean>;
  onSetShareAllowed?(memberId: string, allowed: boolean): void;
  kufuCount?: number;
  onClearAllKufu?(): void;
  // どうがのかざり (household-wide): which decoration is burned into the saved
  // video. Section hidden when either is absent. 「なし」 is paid-only, so on Free
  // it is shown locked rather than hidden — that is where the upgrade is worth
  // explaining.
  decor?: Decor;
  onSelectDecor?(decor: Decor): void;
  canRemoveDecor?: boolean;
  // App Store subscriptions (iOS app). Present → the plan cards buy through
  // Apple instead of setting the plan, with restore / manage and the required
  // subscription terms. Absent (web, older callers) → cards call onSelectPlan.
  billing?: BillingView;
  // test アプリ only (test-mode.ts): テスト用 controls for the active member.
  // Section hidden if absent — never passed in the App Store build.
  testTools?: TestToolsView;
}

export interface TestToolsView {
  streakDays: number;
  onSetStreak(days: number): void;   // 0 clears the streak
  menus: { id: string; name: string; drills: { name: string; level: number }[] }[];
  onSetLevel(presetId: string, drill: string, level: number): void;
  onSetAllLevels(presetId: string, level: number): void;
}

export interface BillingView {
  prices: Partial<Record<ProductId, string>> | null;   // null while loading
  currentProduct: string | null;   // the subscription the household has now
  renewal: string;                 // "2026/10/15 に自動更新" (or "")
  busy: boolean;                   // a purchase / restore is in progress
  status: string;                  // result of the last purchase / restore
  onBuy(id: ProductId): void;
  onRestore(): void;
  onManage(): void;
  onChooseFree(): void;            // Free can't be bought: explains cancelling
}

const PLAN_ORDER: Plan[] = ["free", "premium", "family"];

const NAME_MAX_LEN = 12;

export function renderFamilyScreen(root: HTMLElement, deps: FamilyDeps): void {
  root.textContent = "";
  root.className = "screen family";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "家族";

  const cap = deps.memberCap ?? Infinity;

  // --- Active member selector ---
  const activeCard = document.createElement("div");
  activeCard.className = "family-active-card";

  const activeLabel = document.createElement("label");
  activeLabel.className = "family-label";
  activeLabel.textContent = "設定したいメンバー";

  const activeNote = document.createElement("div");
  activeNote.className = "family-plan-note";
  activeNote.textContent = "えらんだメンバーの設定だけが、この下に出ます";

  const select = document.createElement("select");
  select.className = "family-select";
  select.dataset.memberSelect = "";
  deps.members.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    opt.disabled = i >= cap;   // locked by plan
    if (m.id === deps.activeId) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener("change", () => deps.onSelectMember(select.value));

  activeCard.append(activeLabel, select, activeNote);

  // --- Member list with remove buttons ---
  const listTitle = document.createElement("div");
  listTitle.className = "family-section-label";
  listTitle.dataset.familyAnchor = "members";
  listTitle.textContent = "メンバーを管理する";

  const list = document.createElement("div");
  list.className = "family-member-list";
  list.dataset.memberList = "";
  deps.members.forEach((m, i) => {
    const locked = i >= cap;
    const row = document.createElement("div");
    row.className = `family-member-row${m.id === deps.activeId ? " active" : ""}${locked ? " locked" : ""}`;
    row.dataset.memberRow = m.id;

    // A name box + 「変更」 (locked kids just show their name).
    let name: HTMLElement;
    let rename: HTMLButtonElement | null = null;
    if (locked || !deps.onRenameMember) {
      name = document.createElement("span");
      name.className = "family-member-name";
      name.textContent = locked ? `🔒 ${m.name}` : m.name;
    } else {
      const onRename = deps.onRenameMember;
      const input = document.createElement("input");
      input.className = "family-member-name-input";
      input.dataset.memberName = m.id;
      input.maxLength = NAME_MAX_LEN;
      input.value = m.name;
      const button = document.createElement("button");
      button.className = "family-member-rename";
      button.dataset.memberRename = m.id;
      button.textContent = "変更";
      button.disabled = true;
      const changed = () => { const v = input.value.trim(); return v && v !== m.name ? v : null; };
      input.addEventListener("input", () => { button.disabled = !changed(); });
      const commit = () => { const v = changed(); if (v) onRename(m.id, v); };
      button.addEventListener("click", commit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
      name = input;
      rename = button;
    }

    const del = document.createElement("button");
    del.className = "family-member-del";
    del.dataset.memberDel = m.id;
    del.textContent = "✕";
    del.setAttribute("aria-label", `${m.name} を削除`);
    del.disabled = deps.members.length <= 1;   // can't remove the last member
    del.addEventListener("click", () => deps.onRemoveMember(m.id));

    row.append(name, ...(rename ? [rename] : []), del);
    list.append(row);
  });

  // --- Add member ---
  const addRow = document.createElement("div");
  // Same look as the member rows above: name box, button, and a gap where ✕ sits.
  addRow.className = "family-member-row family-add-member";

  const nameInput = document.createElement("input");
  nameInput.className = "family-member-name-input";
  nameInput.dataset.memberAddInput = "";
  nameInput.maxLength = NAME_MAX_LEN;
  nameInput.placeholder = "新しいメンバーの名前";

  const addBtn = document.createElement("button");
  addBtn.className = "family-member-rename";
  addBtn.dataset.memberAdd = "";
  addBtn.textContent = "＋ 追加";
  addBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    deps.onAddMember(name);
  });

  const addSpacer = document.createElement("span");
  addSpacer.className = "family-add-spacer";
  addSpacer.setAttribute("aria-hidden", "true");
  addRow.append(nameInput, addBtn, addSpacer);
  nameInput.disabled = addBtn.disabled = deps.members.length >= cap;

  // Why adding is off, or why some members are locked.
  const memberHint = document.createElement("div");
  memberHint.className = "family-member-hint";
  memberHint.dataset.memberHint = "";
  if (deps.members.length > cap) {
    memberHint.textContent = "🔒 のメンバーは、プランを上げるか ほかの人を削除すると使えます";
  } else if (deps.members.length >= cap) {
    memberHint.textContent = cap === 1
      ? "2人目からはファミリープランで追加できます"
      : `このプランは${cap}人までです`;
  }
  memberHint.hidden = !memberHint.textContent;

  // --- Plan / upgrade section (one plan for the whole household) ---
  const planTitle = document.createElement("div");
  planTitle.className = "family-section-label";
  planTitle.dataset.familyAnchor = "plan";
  planTitle.textContent = "プラン";

  const planNote = document.createElement("div");
  planNote.className = "family-plan-note";
  planNote.textContent = "家族みんなで1つのプラン";

  const planCards = document.createElement("div");
  planCards.className = "family-plan-cards";
  planCards.dataset.planCards = "";

  const billing = deps.billing;
  if (billing) PLAN_ORDER.forEach((plan) => planCards.append(buildStoreCard(plan, deps.activePlan, billing)));
  else PLAN_ORDER.forEach((plan) => {
    const meta = PLAN_META[plan];
    const isActive = plan === deps.activePlan;

    const card = document.createElement("button");
    card.className = `family-plan-card${isActive ? " active" : ""}`;
    card.dataset.planCard = plan;
    card.disabled = isActive;

    const name = document.createElement("div");
    name.className = "family-plan-name";
    name.textContent = meta.label;

    const price = document.createElement("div");
    price.className = "family-plan-price";
    price.textContent = meta.monthly;

    const yearly = document.createElement("div");
    yearly.className = "family-plan-yearly";
    if (meta.yearly) yearly.textContent = `または ${meta.yearly}`;

    const feats = document.createElement("div");
    feats.className = "family-plan-feats";
    feats.textContent = planFeatsText(plan);

    if (isActive) {
      const badge = document.createElement("div");
      badge.className = "family-plan-badge";
      badge.textContent = "いま";
      card.append(badge);
    }

    card.append(name, price);
    if (meta.yearly) card.append(yearly);
    card.append(feats);
    card.addEventListener("click", () => deps.onSelectPlan(plan));
    planCards.append(card);
  });

  // --- くらす assignment section (E3) ---
  const classNodes = buildClassSection(deps);

  // --- 帯 section (parent sets each member's belt) ---
  const beltNodes = buildBeltSection(deps);

  // --- 応援コメント section (E4, active member) ---
  const commentNodes = buildCommentSection(deps);
  const kufuNodes = buildKufuSection(deps);
  const shareNodes = buildShareSection(deps);
  const decorNodes = buildDecorSection(deps);
  const testNodes = buildTestToolsSection(deps);

  // 1) メンバーを管理する (everyone), 2) 設定したいメンバー and, framed together,
  // only that member's settings, 3) the household plan.
  const memberSettings = document.createElement("div");
  memberSettings.className = "family-member-settings";
  memberSettings.dataset.memberSettings = "";
  memberSettings.dataset.familyAnchor = "settings";
  memberSettings.append(activeCard, ...classNodes, ...beltNodes, ...commentNodes, ...kufuNodes, ...shareNodes, ...testNodes);

  const billingNodes = billing ? buildBillingFooter(billing) : [];
  const howtoNodes = buildHowtoSection(root);
  markAnchor(howtoNodes[0], "howto");
  markAnchor(decorNodes[0], "decor");

  root.append(title, buildJumpNav(root), listTitle, list, addRow, memberHint, memberSettings,
              ...buildParentNote(), ...howtoNodes, ...decorNodes, planTitle, planNote, planCards, ...billingNodes);
}

// The 家族 tab is one long page (members → settings → 使い方 → かざり → プラン), so
// it carries a sticky row of chips that jump straight to a section.
const JUMP_TARGETS: { anchor: string; label: string }[] = [
  { anchor: "members", label: "メンバー" },
  { anchor: "settings", label: "設定" },
  { anchor: "howto", label: "使い方" },
  { anchor: "decor", label: "かざり" },
  { anchor: "plan", label: "プラン" },
];

function markAnchor(node: Node | undefined, anchor: string): void {
  if (node instanceof HTMLElement) node.dataset.familyAnchor = anchor;
}

function buildJumpNav(root: HTMLElement): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "family-jump-nav";
  bar.dataset.familyJump = "";
  for (const t of JUMP_TARGETS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "family-jump-chip";
    chip.dataset.familyJumpTo = t.anchor;
    chip.textContent = t.label;
    chip.addEventListener("click", () => {
      const target = root.querySelector(`[data-family-anchor="${t.anchor}"]`);
      // scroll-margin-top (CSS) keeps the sticky bar itself off the heading.
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    bar.append(chip);
  }
  return bar;
}

// テスト用 (test アプリ only): the active member's 🔥 streak and every drill's
// level per menu, set directly. Returns [] when the wiring is absent.
function buildTestToolsSection(deps: FamilyDeps): Node[] {
  const tools = deps.testTools;
  if (!tools) return [];

  const box = document.createElement("div");
  box.className = "family-test-tools";
  box.dataset.testTools = "";

  const heading = document.createElement("div");
  heading.className = "family-section-label family-test-title";
  heading.textContent = "🧪 テスト用（test アプリだけ）";

  // 🔥 何日連続
  const streakLabel = document.createElement("div");
  streakLabel.className = "family-plan-note";
  streakLabel.textContent = `🔥 いまの連続: ${tools.streakDays}日`;

  const streakRow = document.createElement("div");
  streakRow.className = "family-test-row";
  const streakInput = document.createElement("input");
  streakInput.type = "number";
  streakInput.inputMode = "numeric";
  streakInput.min = "0";
  streakInput.max = "9999";
  streakInput.value = String(tools.streakDays);
  streakInput.className = "family-member-name-input family-test-number";
  streakInput.dataset.testStreakInput = "";
  const streakSet = testButton("この日数にする", () => tools.onSetStreak(Math.max(0, Math.floor(Number(streakInput.value)) || 0)));
  streakSet.dataset.testStreakSet = "";
  const suffix = document.createElement("span");
  suffix.className = "family-plan-note";
  suffix.textContent = "日";
  streakRow.append(streakInput, suffix, streakSet);

  box.append(heading, streakLabel, streakRow);

  // 種目のレベル, per menu
  tools.menus.forEach((menu) => {
    const menuTitle = document.createElement("div");
    menuTitle.className = "family-section-label family-test-menu";
    menuTitle.textContent = `${menu.name} の種目レベル`;
    box.append(menuTitle);

    if (!menu.drills.length) {
      const empty = document.createElement("div");
      empty.className = "family-plan-note";
      empty.textContent = "種目がありません";
      box.append(empty);
      return;
    }

    const all = document.createElement("div");
    all.className = "family-test-row";
    [0, BARS_PER_BELT - 1, BARS_PER_BELT].forEach((lv) => {
      const b = testButton(`ぜんぶ Lv.${lv}`, () => tools.onSetAllLevels(menu.id, lv));
      b.dataset.testAllLevels = `${menu.id}:${lv}`;
      all.append(b);
    });
    box.append(all);

    menu.drills.forEach((drill) => {
      const row = document.createElement("label");
      row.className = "family-test-row family-test-drill";
      const name = document.createElement("span");
      name.className = "family-test-drill-name";
      name.textContent = drill.name;
      const select = document.createElement("select");
      select.className = "family-class-select family-test-level";
      select.dataset.testLevel = `${menu.id}:${drill.name}`;
      for (let lv = 0; lv <= BARS_PER_BELT; lv++) {
        const opt = document.createElement("option");
        opt.value = String(lv);
        opt.textContent = `Lv.${lv}`;
        if (lv === drill.level) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener("change", () => tools.onSetLevel(menu.id, drill.name, Number(select.value)));
      row.append(name, select);
      box.append(row);
    });
  });

  const note = document.createElement("div");
  note.className = "family-plan-note";
  note.textContent = "ここで決めた数字はスタート地点です。あとは練習するたびに、ふつうのアプリと同じように増えます（連続日数は今日の練習で+1）。帯そのものは上の「帯を変える」で。プランは下のカードで無料で切りかえられます。";
  box.append(note);

  return [box];
}

function testButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "family-member-rename family-test-button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/// 動画のかざり: one of Alan's three decorations, or 「なし」 on a paid plan.
function buildDecorSection(deps: FamilyDeps): Node[] {
  const { decor, onSelectDecor } = deps;
  if (!decor || !onSelectDecor) return [];

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "どうがのかざり";

  const note = document.createElement("p");
  note.className = "family-plan-note";
  note.textContent = "ほぞんする どうがに つくかざりです。";

  const list = document.createElement("div");
  list.className = "decor-options";
  list.dataset.decorOptions = "";

  for (const option of DECORS) {
    const locked = option === "none" && !deps.canRemoveDecor;
    const meta = DECOR_META[option];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "decor-option";
    btn.dataset.decor = option;
    if (option === decor) btn.classList.add("on");
    if (locked) {
      btn.classList.add("locked");
      btn.disabled = true;
    }

    const name = document.createElement("span");
    name.className = "decor-option-name";
    name.textContent = locked ? `🔒 ${meta.label}` : meta.label;
    const hint = document.createElement("span");
    hint.className = "decor-option-hint";
    hint.textContent = locked ? "プレミアムでえらべます" : meta.hint;
    btn.append(name, hint);
    // The tinted border alone read as 「戻ってしまった」 on the phone: the picked
    // one now says so, like the plan cards' 「いま」 badge.
    if (option === decor) {
      const badge = document.createElement("span");
      badge.className = "decor-option-badge";
      badge.dataset.decorOn = "";
      badge.textContent = "いまこれ";
      btn.append(badge);
    }
    btn.addEventListener("click", () => onSelectDecor(option));
    list.append(btn);
  }

  return [sectionTitle, note, list];
}

function planFeatsText(plan: Plan): string {
  const limits = PLAN_LIMITS[plan];
  const perKid = limits.members > 1 ? "/人" : "";
  const kidsText = limits.members === 1 ? "1人" : `${limits.members}人まで`;
  const kufuText = limits.kufuPerDrill === 0 ? "工夫なし" : `工夫 ${limits.kufuTotal}${perKid}`;
  const lines = [kidsText, `メニュー ${limits.presetsPerMember}${perKid}`, kufuText];
  // Same rule that unlocks かざり「なし」, so the card can't promise more than the picker allows.
  if (canRemoveDecor(plan)) lines.push("キャラなし動画");
  return lines.join("\n");
}

// App Store mode: a plan card with 月 / 年 buttons at the store's own prices.
function buildStoreCard(plan: Plan, activePlan: Plan, billing: BillingView): HTMLElement {
  const isActive = plan === activePlan;
  const card = document.createElement("div");
  card.className = `family-plan-card family-store-card${isActive ? " active" : ""}`;
  card.dataset.planCard = plan;

  if (isActive) {
    const badge = document.createElement("div");
    badge.className = "family-plan-badge";
    badge.textContent = "いま";
    card.append(badge);
  }

  const name = document.createElement("div");
  name.className = "family-plan-name";
  name.textContent = PLAN_META[plan].label;

  const feats = document.createElement("div");
  feats.className = "family-plan-feats";
  feats.textContent = planFeatsText(plan);
  card.append(name, feats);

  if (plan === "free") {
    if (!isActive) {
      const toFree = document.createElement("button");
      toFree.className = "family-plan-buy family-plan-free";
      toFree.dataset.chooseFree = "";
      toFree.textContent = "フリーにする";
      toFree.disabled = billing.busy;
      toFree.addEventListener("click", () => billing.onChooseFree());
      card.append(toFree);
    }
    return card;
  }

  (["monthly", "yearly"] as Period[]).forEach((period) => {
    const id = productId(plan, period);
    const price = billing.prices?.[id];
    const unit = period === "monthly" ? "月" : "年";
    const current = id === billing.currentProduct;
    const buy = document.createElement("button");
    buy.className = `family-plan-buy${current ? " current" : ""}`;
    buy.dataset.buy = id;
    // null prices = still loading; a missing price = not for sale right now.
    buy.textContent = !billing.prices ? "…" : !price ? "—" : `${current ? "✓ " : ""}${price}/${unit}`;
    buy.setAttribute("aria-label", `${PLAN_META[plan].label} ${unit}ごと${price ? ` ${price}` : ""}${current ? "（いまのプラン）" : ""}`);
    buy.disabled = billing.busy || current || !price;
    buy.addEventListener("click", () => billing.onBuy(id));
    card.append(buy);
  });
  return card;
}

// Under the cards: renewal date, last result, restore / manage, and the
// auto-renewal terms App Review requires next to a subscription purchase.
function buildBillingFooter(billing: BillingView): Node[] {
  const renewal = document.createElement("div");
  renewal.className = "family-plan-note";
  renewal.dataset.billingRenewal = "";
  renewal.textContent = billing.renewal;
  renewal.hidden = !billing.renewal;

  const status = document.createElement("div");
  status.className = "family-billing-status";
  status.dataset.billingStatus = "";
  status.setAttribute("role", "status");
  status.textContent = billing.busy ? "Apple と通信中…" : billing.status;
  status.hidden = !status.textContent;

  const actions = document.createElement("div");
  actions.className = "family-billing-actions";
  const restore = document.createElement("button");
  restore.className = "family-billing-action";
  restore.dataset.restore = "";
  restore.textContent = "購入を復元";
  restore.disabled = billing.busy;
  restore.addEventListener("click", () => billing.onRestore());
  const manage = document.createElement("button");
  manage.className = "family-billing-action";
  manage.dataset.manage = "";
  // Zero-width space: on a narrow iPhone the label wraps before を管理, not
  // between 管 and 理.
  manage.textContent = "サブスクリプション\u200Bを管理";
  manage.setAttribute("aria-label", "サブスクリプションを管理");
  manage.addEventListener("click", () => billing.onManage());
  actions.append(restore, manage);

  const legal = document.createElement("p");
  legal.className = "family-plan-legal";
  legal.dataset.billingLegal = "";
  legal.textContent = "プレミアム・ファミリーは自動更新のサブスクリプションです（1か月または1年）。"
    + "お支払いは Apple ID に請求され、期間が終わる24時間前までに自動更新を止めないと、同じ期間・同じ金額で更新されます。"
    + "止めるときは「サブスクリプションを管理」から。 ";
  const links: [string, string][] = [["利用規約", TERMS_URL], ["プライバシーポリシー", PRIVACY_URL]];
  links.filter(([, url]) => url).forEach(([label, url], i) => {
    if (i > 0) legal.append(" ・ ");
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;
    legal.append(a);
  });

  return [renewal, status, actions, legal];
}

// Parent-controlled 帯, per saved menu of the active member: each menu gets a
// <select> of every belt. Picking one sets that menu's belt and starts its
// 積み重ね over. Returns [] when the belt wiring is absent (earlier callers).
function buildBeltSection(deps: FamilyDeps): Node[] {
  if (!deps.onSetMenuBelt || !deps.menuBelts) return [];
  const onSet = deps.onSetMenuBelt;
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";

  const note = document.createElement("div");
  note.className = "family-plan-note family-belt-note";
  note.textContent = deps.menuBelts.length
    ? `${activeName} の帯はメニューごと。ぜんぶの種目が Lv.10 になると上がります。ここで変えると積み重ねは0から。`
    : "メニューを保存すると、メニューごとの帯を変えられます。";

  const list = document.createElement("div");
  list.className = "family-class-list";
  list.dataset.beltList = "";

  deps.menuBelts.forEach((mb) => {
    const row = document.createElement("div");
    row.className = "family-belt-row";
    row.dataset.beltRow = mb.id;

    const name = document.createElement("div");
    name.className = "family-section-label family-belt-title";
    name.textContent = `${mb.name}の帯を変える`;

    const select = document.createElement("select");
    select.className = "family-class-select";
    select.dataset.beltSelect = mb.id;
    BELTS.forEach((b, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = b.icon ? `${b.icon} ${b.name}` : b.name;
      if (i === mb.belt) opt.selected = true;
      select.append(opt);
    });
    select.addEventListener("change", () => onSet(mb.id, Number(select.value)));

    row.append(name, select);
    list.append(row);
  });

  return [list, note];
}

// LINE・SNS: a checkbox for the kid picked in 設定したい人. Checked shows 「LINE・SNSで送る」 on that kid's
// done screen (no gate there — this tab is already behind it). Returns [] when
// the wiring is absent.
function buildShareSection(deps: FamilyDeps): Node[] {
  if (!deps.onSetShareAllowed || !deps.shareAllowed) return [];
  const onSet = deps.onSetShareAllowed;
  const allowed = deps.shareAllowed;

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "LINE・SNS";

  const note = document.createElement("div");
  note.className = "family-plan-note";
  note.textContent = "チェックすると、稽古のあとに練習動画を連携するボタンを表示します。";

  const list = document.createElement("div");
  list.className = "family-class-list";
  list.dataset.shareList = "";

  deps.members.filter((m) => m.id === deps.activeId).forEach((m) => {
    const row = document.createElement("label");
    row.className = "family-class-row family-share-row";
    row.dataset.shareRow = m.id;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "family-share-check";
    box.dataset.shareAllowed = m.id;
    box.checked = !!allowed[m.id];
    box.addEventListener("change", () => onSet(m.id, box.checked));

    // The member is already picked above, so just the checkbox and its label.
    const text = document.createElement("span");
    text.className = "family-share-text";
    text.textContent = "LINE・SNSで送るボタンを表示する";

    row.append(box, text);
    list.append(row);
  });

  return [sectionTitle, note, list];
}

// 「工夫をぜんぶけす」 for the active member (the caller confirms first).
// Returns [] when the wiring is absent.
function buildKufuSection(deps: FamilyDeps): Node[] {
  if (!deps.onClearAllKufu || deps.kufuCount === undefined) return [];
  const onClear = deps.onClearAllKufu;
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "工夫をけす";

  const note = document.createElement("div");
  note.className = "family-plan-note";
  note.textContent = "相談してからけすようにしてください";

  const btn = document.createElement("button");
  btn.className = "family-kufu-clear";
  btn.dataset.kufuClearAll = "";
  btn.disabled = deps.kufuCount === 0;
  btn.textContent = deps.kufuCount === 0
    ? `${activeName} の工夫はありません`
    : `${activeName} の工夫をぜんぶけす（${deps.kufuCount}件）`;
  btn.addEventListener("click", () => onClear());

  return [sectionTitle, note, btn];
}

// Per-active-member 応援コメント: the 感想 input with a save button (shown to the
// kid above the 稽古 開始 button). The ファイト comment was dropped. Returns the nodes to append, or [] when E4 wiring is absent.
function buildCommentSection(deps: FamilyDeps): Node[] {
  if (!deps.onSaveComment || !deps.comments) return [];
  const onSave = deps.onSaveComment;
  const comments = deps.comments;
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "応援コメント";

  const note = document.createElement("div");
  note.className = "family-comment-note";
  note.textContent = `${activeName} へのメッセージ`;

  const wrap = document.createElement("div");
  wrap.className = "family-comment-list";
  wrap.dataset.commentList = "";

  // Two lines: [text……] [保存] / by [name]. The text box starts at the left
  // edge; "by" sits just left of the name box below it.
  const row = document.createElement("div");
  row.className = "family-comment-row";

  const input = document.createElement("input");
  input.className = "family-comment-input";
  input.dataset.commentKansou = "";
  input.maxLength = COMMENT_MAX_LEN;
  input.value = comments.kansou;
  input.placeholder = "いつも がんばってるね";

  const byLab = document.createElement("label");
  byLab.className = "family-comment-label family-comment-by-label";
  byLab.textContent = "by";

  const byInput = document.createElement("input");
  byInput.className = "family-comment-input";
  byInput.dataset.commentKansouBy = "";
  byInput.maxLength = COMMENT_BY_MAX_LEN;
  byInput.value = comments.kansouBy ?? "";
  byInput.placeholder = "おかあさん";

  const save = document.createElement("button");
  save.className = "family-comment-save";
  save.dataset.commentSaveKansou = "";
  save.textContent = "保存";
  save.addEventListener("click", () => {
    const text = input.value;
    const by = byInput.value;
    onSave("kansouBy", by);
    onSave("kansou", text);
  });

  input.setAttribute("aria-label", "感想");
  row.append(input, save, byLab, byInput);
  wrap.append(row);

  return [sectionTitle, note, wrap];
}

// The picked kid's メニュー (a saved menu, formerly "くらす"): a <select> of the
// family's saved menus plus "なし". Only the kid chosen in 設定したい人 is shown.
// Returns [] when the wiring is absent.
function buildClassSection(deps: FamilyDeps): Node[] {
  if (!deps.onAssignClass || !deps.classes || !deps.assignments) return [];
  const onAssign = deps.onAssignClass;
  const classes = deps.classes;
  const active = deps.members.find((m) => m.id === deps.activeId);
  if (!active) return [];

  const classTitle = document.createElement("div");
  classTitle.className = "family-section-label";
  classTitle.textContent = "メニュー";

  // No saved menus yet → nothing to pick. Guide the parent to make one.
  if (classes.length === 0) {
    const hint = document.createElement("div");
    hint.className = "family-class-hint";
    hint.dataset.classHint = "";
    hint.textContent = "メニューを保存すると、ここでえらべます";
    return [classTitle, hint];
  }

  const classList = document.createElement("div");
  classList.className = "family-class-list";
  classList.dataset.classList = "";

  const row = document.createElement("div");
  row.className = "family-class-row";
  row.dataset.classRow = active.id;

  const select = document.createElement("select");
  select.className = "family-class-select";
  select.dataset.classSelect = active.id;

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "なし";
  select.append(none);

  const assigned = deps.assignments[active.id] ?? null;
  classes.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === assigned) opt.selected = true;
    select.append(opt);
  });
  if (assigned === null) none.selected = true;

  select.addEventListener("change", () => onAssign(active.id, select.value || null));

  row.append(select);
  classList.append(row);
  return [classTitle, classList];
}
