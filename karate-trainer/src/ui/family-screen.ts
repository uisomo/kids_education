// 家族 screen (Tower E). E1: member management — list members, add/remove, and
// select the active member via a dropdown. E2 (plans), E3 (class assignment),
// and E4 (応援コメント) build on this screen later.

import type { Member } from "../member-store";
import { buildParentNote } from "./howto";
import { icon, plainIcon } from "../alan/alan-icons.js";
import type { Preset } from "../preset-store";
import { type Plan, PLAN_LIMITS, PLAN_META } from "../plan-store";
import { type Period, type ProductId, APP_KEY, PRIVACY_URL, TERMS_URL, productId, series } from "../billing";
import { type AppKey, APPS, SUITE_PITCH, fallbackPrice, planFeatures, suiteSaving, upgradeHint } from "../alan/alan-billing.js";
import { BELTS, BARS_PER_BELT } from "../belt-store";
import { type Decor, DECORS, DECOR_META, canRemoveDecor } from "../decor-store";
import { LETTER_MAX_LEN, LETTER_BY_MAX_LEN, LETTER_KEEP } from "../letter-store";
import type { Letter } from "../letter-store";
import { COPY } from "../flavor";
import { PARENT_CHOICES, type ParentChoice, type PrivacyParent } from "../alan/alan-privacy";
import { type DeviceOwner, PIN_MIN_LEN, PIN_MAX_LEN } from "../parent-lock-store";

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
  // おたより (parent → the active member), newest first. Sending adds one to the
  // kid's queue instead of overwriting yesterday's, and the list below the box
  // shows which have been read. Optional so pre-E4 callers/tests keep working
  // (section is hidden if either is absent). Free on every plan.
  letters?: Letter[];
  onSendLetter?(text: string, by: string): void;
  onDeleteLetter?(id: string): void;
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
  // 稽古中に キラキラを画面へ出すかどうか。**どのキラキラかは ここでは選ばない**
  // （子どもが アイテムタブでつける）。onSetLiveOn が無ければ この節ごと出ない。
  liveOn?: boolean;
  liveSparkleName?: string | null;
  onSetLiveOn?(on: boolean): void;
  // おへや・かめん（5.16）：おうちの人の 上書き（家じゅう 共通）。まかせる 以外は 子どもが さわれない
  privacyParent?: PrivacyParent;
  onSetPrivacyParent?(parent: PrivacyParent): void;
  canRemoveDecor?: boolean;
  // App Store subscriptions (iOS app). Present → the plan cards buy through
  // Apple instead of setting the plan, with restore / manage and the required
  // subscription terms. Absent (web, older callers) → cards call onSelectPlan.
  billing?: BillingView;
  // おうちの人のロック（端末ぜんぶで一つ）。Section hidden if absent.
  parentLock?: ParentLockView;
  // test アプリ only (test-mode.ts): テスト用 controls for the active member.
  // Section hidden if absent — never passed in the App Store build.
  testTools?: TestToolsView;
}

// 家族タブの前に立つゲートの設定。暗証番号を決めると、かけ算の代わりにそれを
// 聞くようになる（かけ算は「幼い子には解けない」という当て推量なので、子が
// 育つと破れる。親だけが知っている番号なら破れない）。
export interface ParentLockView {
  hasPin: boolean;
  owner: DeviceOwner | null;
  biometrics: boolean;
  // この端末の生体認証の名前（Face ID / 指紋（Touch ID））。使えないなら null。
  biometryLabel: string | null;
  // 使えない番号なら理由を返し、何もしない。null で暗証番号をやめる。
  onSetPin(pin: string | null): string | null;
  onSetOwner(owner: DeviceOwner): void;
  onSetBiometrics(on: boolean): void;
}

export interface TestToolsView {
  streakDays: number;
  onSetStreak(days: number): void;   // 0 clears the streak
  menus: { id: string; name: string; drills: { name: string; level: number }[] }[];
  onSetLevel(presetId: string, drill: string, level: number): void;
  onSetAllLevels(presetId: string, level: number): void;
  // ★ Show Apple's rating sheet now — the real app only asks by itself from
  // the second day on, which is hard to sit and wait for.
  onAskReview?(): void;
  // 初回ガイド「10びょう いっしょに録る」をもう一度（ふつうは一度きり）。
  onRestartGuide?(): void;
  // 🎁 アイテム（キラキラ・帯・ブロック）を ぜんぶ開ける／最初にもどす。
  // 本物のアプリでは 帯を何十本も取らないと確かめられないので。
  sparkles?: { owned: number; total: number; belts: number; blocks: number; blockTotal: number };
  onUnlockAllSparkles?(): void;
  onResetSparkles?(): void;
}

export interface BillingView {
  prices: Partial<Record<ProductId, string>> | null;   // null while loading
  trials?: Partial<Record<ProductId, string>>;          // free trial length ("1週間")
  currentProduct: string | null;   // the subscription the household has now
  renewal: string;                 // "2026/10/15 に自動更新" (or "")
  busy: boolean;                   // a purchase / restore is in progress
  status: string;                  // result of the last purchase / restore
  onBuy(id: ProductId): void;
  onRestore(): void;
  onManage(): void;
  onChooseFree(): void;            // Free can't be bought: explains cancelling
  // スイートを ほかの アランの アプリで 買っている ときの その アプリ（ここでは 買う ボタンを 出さない。2重に 払わせない）。ほかは null
  fromApp?: AppKey | null;
}

// カードの ならび：スイート（いちばん上・大きく）→ ファミリー → プレミアム → フリー（SERIES_GUIDE 5.8b・5.8c）。
// この アプリで 売る プランだけ（series.sells）。
const PLAN_ORDER: Plan[] = [...series.sells].reverse();

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
      name.textContent = m.name;
      if (locked) { name.classList.add("with-icon"); name.prepend(plainIcon("lock", "s")); }
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
    del.append(icon("trash"));
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
    memberHint.classList.add("with-icon");
    memberHint.append(plainIcon("lock", "s"), "のメンバーは、プランを上げるか ほかの人を削除すると使えます");
  } else if (deps.members.length >= cap) {
    memberHint.textContent = cap === 1
      ? "2人目からは ファミリー か アランのスイート で追加できます"
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

  const billing = deps.billing;
  // ほかの アランの アプリで スイートに 入っている（ここでは 買わない）
  const suiteElsewhere = billing?.fromApp && billing.fromApp !== APP_KEY ? billing.fromApp : null;
  const planInfo: HTMLElement[] = [];
  if (suiteElsewhere) {
    const elsewhere = document.createElement("div");
    elsewhere.className = "a-plan-hint";
    elsewhere.dataset.suiteElsewhere = suiteElsewhere;
    elsewhere.textContent = `${APPS[suiteElsewhere].name}で 入っています（アランの アプリ ぜんぶ つかえます）`;
    planInfo.push(elsewhere);
  } else {
    // 空手の フリーは 1日の 回数で なく メニュー・工夫の 数で かぎる
    const hint = upgradeHint(APP_KEY, deps.activePlan, "メニュー・工夫", { daily: false });
    if (hint) {
      const el = document.createElement("div");
      el.className = "a-plan-hint";
      el.dataset.upgradeHint = "";
      el.textContent = hint;
      planInfo.push(el);
    }
  }

  const planCards = document.createElement("div");
  planCards.className = "family-plan-cards";
  planCards.dataset.planCards = "";
  PLAN_ORDER.forEach((plan) => planCards.append(billing
    ? buildStoreCard(plan, deps.activePlan, billing, !!suiteElsewhere)
    : buildPickCard(plan, deps.activePlan, () => deps.onSelectPlan(plan))));

  // --- くらす assignment section (E3) ---
  const classNodes = buildClassSection(deps);

  // --- 帯 section (parent sets each member's belt) ---
  const beltNodes = buildBeltSection(deps);

  // --- おたより section (E4 → Phase 2, active member) ---
  const commentNodes = buildLetterSection(deps);
  const kufuNodes = buildKufuSection(deps);
  const shareNodes = buildShareSection(deps);
  const decorNodes = buildDecorSection(deps);
  const liveNodes = buildLiveEffectSection(deps);
  const privacyNodes = buildPrivacySection(deps);
  const testNodes = buildTestToolsSection(deps);

  // 1) メンバーを管理する (everyone), 2) 設定したいメンバー and, framed together,
  // only that member's settings, 3) the household plan.
  const memberSettings = document.createElement("div");
  memberSettings.className = "family-member-settings";
  memberSettings.dataset.memberSettings = "";
  memberSettings.dataset.familyAnchor = "settings";
  memberSettings.append(activeCard, ...classNodes, ...beltNodes, ...commentNodes, ...kufuNodes, ...shareNodes, ...testNodes);

  const billingNodes = billing ? buildBillingFooter(billing) : [];
  // 使い方どうが は 特訓タブの 🎬 に移した（この長いページに埋もれていたし、
  // 使い方を知りたいのは 稽古を始めるところに立っているとき）。
  const parentNodes = buildParentNote();
  const lockNodes = buildParentLockSection(deps);
  markAnchor(parentNodes[0], "parent");
  markAnchor(lockNodes[0], "lock");
  markAnchor(decorNodes[0], "decor");
  markAnchor(liveNodes[0], "live");

  // The jump bar goes first: it is pinned at the very top of the screen (CSS),
  // where its own background covers the strip behind the phone's clock.
  root.append(buildJumpNav(root, { live: liveNodes.length > 0 }), title, listTitle, list, addRow, memberHint, memberSettings,
              ...parentNodes, ...lockNodes, ...decorNodes, ...liveNodes, ...privacyNodes,
              planTitle, planNote, ...planInfo, planCards, ...billingNodes);
}

// The 家族 tab is one long page (members → settings → 保護者の方へ → かざり →
// プラン), so it carries chips, pinned at the top of the screen, that jump
// straight to a section. They wrap onto a second row (CSS) — on a small phone a
// horizontally scrolling row hid the last chips off the edge of the screen.
const JUMP_TARGETS: { anchor: string; label: string }[] = [
  { anchor: "members", label: "メンバー" },
  { anchor: "settings", label: "設定" },
  { anchor: "parent", label: "保護者へ" },
  { anchor: "lock", label: "ロック" },
  { anchor: "decor", label: "かざり" },
  { anchor: "live", label: "キラキラ" },
  { anchor: "plan", label: "プラン" },
];

function markAnchor(node: Node | undefined, anchor: string): void {
  if (node instanceof HTMLElement) node.dataset.familyAnchor = anchor;
}

// `present` says which optional sections were actually built, so a chip never
// points at a section this iPhone doesn't have (tapping it would do nothing).
function buildJumpNav(root: HTMLElement, present: { live: boolean }): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "family-jump-nav";
  bar.dataset.familyJump = "";
  for (const t of JUMP_TARGETS.filter((t) => t.anchor !== "live" || present.live)) {
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

  // ★ レビュー: iOS decides whether the sheet really appears, so it may do
  // nothing at all — that is the system, not the button.
  if (tools.onAskReview) {
    const reviewRow = document.createElement("div");
    reviewRow.className = "family-test-row";
    const reviewBtn = testButton("★ レビュー画面を出す", () => tools.onAskReview!());
    reviewBtn.dataset.testAskReview = "";
    const note = document.createElement("span");
    note.className = "family-plan-note";
    note.textContent = "出ないこともあります（iOSが決めます）";
    reviewRow.append(reviewBtn, note);
    box.append(reviewRow);
  }

  // 🎬 初回ガイドをやり直す（入れたばかりの人に出る「10びょうで やってみる？」）。
  if (tools.onRestartGuide) {
    const guideRow = document.createElement("div");
    guideRow.className = "family-test-row";
    const guideBtn = testButton("🎬 初回ガイドをやり直す", () => tools.onRestartGuide!());
    guideBtn.dataset.testRestartGuide = "";
    const note = document.createElement("span");
    note.className = "family-plan-note";
    note.textContent = "特訓タブに戻ると出ます";
    guideRow.append(guideBtn, note);
    box.append(guideRow);
  }

  // 🎁 アイテム（キラキラ・帯・ブロック）を まとめて開ける／戻す
  if (tools.sparkles && tools.onUnlockAllSparkles && tools.onResetSparkles) {
    const items = tools.sparkles;
    const label = document.createElement("div");
    label.className = "family-plan-note";
    label.dataset.testSparkleCount = "";
    label.textContent = `✨ ${items.owned}/${items.total}　${COPY.belt} ${items.belts}本　🧊 ${items.blocks}/${items.blockTotal}`;
    const row = document.createElement("div");
    row.className = "family-test-row";
    const all = testButton("🎁 ぜんぶ開ける", () => tools.onUnlockAllSparkles!());
    all.dataset.testUnlockSparkles = "";
    const reset = testButton("↩︎ 最初にもどす", () => tools.onResetSparkles!());
    reset.dataset.testResetSparkles = "";
    row.append(all, reset);
    box.append(label, row);
  }

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
  note.textContent = `ここで決めた数字はスタート地点です。あとは練習するたびに、ふつうのアプリと同じように増えます（連続日数は今日の練習で+1）。${COPY.belt}そのものは上の「${COPY.belt}を変える」で。プランは下のカードで無料で切りかえられます。`;
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
    name.textContent = meta.label;
    if (locked) { name.classList.add("with-icon"); name.prepend(plainIcon("lock", "s")); }
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

/// 稽古中のキラキラ: 練習しているあいだ、画面にもキラキラを出すかどうか。
///
/// **どのキラキラかは ここでは選ばない。** 子どもが アイテムタブでつけたものが、
/// 稽古中の画面にも、保存する動画にも 同じように出る。ここで切れるのは
/// 「稽古中の画面に出すか」だけ（カメラと電池のはなし）。動画のほうは変わらない。
function buildLiveEffectSection(deps: FamilyDeps): Node[] {
  const { liveOn, liveSparkleName, onSetLiveOn } = deps;
  if (!onSetLiveOn) return [];

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = `${COPY.practice}中のキラキラ`;

  const note = document.createElement("p");
  note.className = "family-plan-note";
  note.textContent = (liveSparkleName
    ? `いまついているのは「${liveSparkleName}」です。`
    : "いまは何もついていません（アイテムタブでつけられます）。")
    + `${COPY.practice}しているあいだ、うごきに合わせて画面にかざりが出ます。`
    + "ほぞんする どうが には、つけているものが あとから入ります（この設定とは関係ありません）。"
    + "カメラと電池をつかうので、あつくなるときは「画面には出さない」にしてください。";

  const list = document.createElement("div");
  list.className = "decor-options";
  list.dataset.liveEffectOptions = "";

  const options: { on: boolean; name: string; hint: string }[] = [
    { on: true, name: "画面にも出す", hint: `${COPY.practice}中も見える` },
    { on: false, name: "画面には出さない", hint: "どうがには入る" },
  ];
  for (const option of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "decor-option";
    btn.dataset.liveEffect = option.on ? "on" : "";
    if (option.on === liveOn) btn.classList.add("on");

    const name = document.createElement("span");
    name.className = "decor-option-name";
    name.textContent = option.name;
    const hint = document.createElement("span");
    hint.className = "decor-option-hint";
    hint.textContent = option.hint;
    btn.append(name, hint);
    if (option.on === liveOn) {
      const badge = document.createElement("span");
      badge.className = "decor-option-badge";
      badge.dataset.liveEffectOn = "";
      badge.textContent = "いまこれ";
      btn.append(badge);
    }
    btn.addEventListener("click", () => onSetLiveOn(option.on));
    list.append(btn);
  }

  return [sectionTitle, note, list];
}

/// おへや・かめん（SERIES_GUIDE 5.16）：どうがに うつる へやと かおを かくすか。
/// 子どもは ホームの「かくす」で きりかえる。ここで「いつも オン／いつも オフ」に すると
/// 子どもの 好みより こちらが つかわれ、ホームの トグルは さわれなくなる。
function buildPrivacySection(deps: FamilyDeps): Node[] {
  const { privacyParent, onSetPrivacyParent } = deps;
  if (!privacyParent || !onSetPrivacyParent) return [];

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "どうがで かくす（おへや・かめん）";

  const note = document.createElement("p");
  note.className = "family-plan-note";
  note.textContent = "おへや：うしろの へやを 絵に かえます。かめん：かおに アランたちの かめんを つけます。"
    + "「まかせる」は 子どもが ホームの「かくす」で えらびます。「いつも オン／オフ」に すると 子どもは かえられません。"
    + "かくす まえの どうがは アプリの 外に 出ません。";

  const rows: { key: keyof PrivacyParent; name: string }[] = [
    { key: "room", name: "おへや" },
    { key: "face", name: "かめん" },
  ];
  const nodes: Node[] = [sectionTitle, note];
  for (const row of rows) {
    const label = document.createElement("div");
    label.className = "privacy-parent-label";
    label.textContent = row.name;
    const list = document.createElement("div");
    list.className = "decor-options privacy-parent-options";
    list.dataset.privacyParent = row.key;
    for (const choice of PARENT_CHOICES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "decor-option";
      btn.dataset.privacyChoice = choice.id;
      const current = privacyParent[row.key] === choice.id;
      if (current) btn.classList.add("on");
      const name = document.createElement("span");
      name.className = "decor-option-name";
      name.textContent = choice.name;
      btn.append(name);
      if (current) {
        const badge = document.createElement("span");
        badge.className = "decor-option-badge";
        badge.textContent = "いまこれ";
        btn.append(badge);
      }
      btn.addEventListener("click", () => onSetPrivacyParent({ ...privacyParent, [row.key]: choice.id as ParentChoice }));
      list.append(btn);
    }
    nodes.push(label, list);
  }
  return nodes;
}

// カードの 行（シリーズ共通の planFeatures に 空手の 数を わたす）。空手の フリーは 1日の 回数でなく
// メニュー・工夫の 数で かぎる（daily: false）。数は PLAN_LIMITS（アプリが まもる 上限）と おなじ。
export function planFeatureLines(plan: Plan): string[] {
  const free = PLAN_LIMITS.free;
  const paid = PLAN_LIMITS.premium;
  const decor = canRemoveDecor("premium") ? ["キャラなし動画"] : [];
  return planFeatures(APP_KEY, plan, {
    daily: false,
    free: [`メニュー ${free.presetsPerMember}`, `工夫 ${free.kufuTotal}`],
    paid: [`メニュー ${paid.presetsPerMember}`, `工夫 ${paid.kufuTotal}`, ...decor],
  });
}

// カードの 中身（名前・スイートの ひとこと・行・おとくさ）。見た目は シリーズ共通の .a-plan（tokens.css）。
function planCardShell(card: HTMLElement, plan: Plan, activePlan: Plan): void {
  const isActive = plan === activePlan;
  card.className = `a-plan family-plan${plan === "suite" ? " suite" : ""}${isActive ? " current active" : ""}`;
  card.dataset.planCard = plan;

  if (isActive || plan === "suite") {
    const badge = document.createElement("div");
    badge.className = "a-plan-badge";
    badge.textContent = isActive ? "いま" : "おすすめ";
    card.append(badge);
  }

  const name = document.createElement("div");
  name.className = "a-plan-name";
  name.textContent = PLAN_META[plan].label;
  card.append(name);

  if (plan === "suite") {
    const pitch = document.createElement("div");
    pitch.className = "a-plan-pitch";
    pitch.textContent = SUITE_PITCH;
    card.append(pitch);
  }

  const feats = document.createElement("ul");
  feats.className = "a-plan-feats";
  planFeatureLines(plan).forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    feats.append(li);
  });
  card.append(feats);

  const saving = plan === "suite" ? suiteSaving() : "";
  if (saving) {
    const el = document.createElement("div");
    el.className = "a-plan-saving";
    el.textContent = saving;
    card.append(el);
  }
}

// お店の ない とき（ウェブ・テスト版）：カードを おすと その プランに なる。
function buildPickCard(plan: Plan, activePlan: Plan, onPick: () => void): HTMLElement {
  const meta = PLAN_META[plan];
  const card = document.createElement("button");
  planCardShell(card, plan, activePlan);
  card.disabled = plan === activePlan;

  const price = document.createElement("div");
  price.className = "family-plan-price";
  price.textContent = meta.monthly;
  card.append(price);
  if (meta.yearly) {
    const yearly = document.createElement("div");
    yearly.className = "family-plan-yearly";
    yearly.textContent = `または ${meta.yearly}`;
    card.append(yearly);
  }
  card.addEventListener("click", onPick);
  return card;
}

// App Store mode: a plan card with 月 / 年 buttons at the store's own prices.
// noBuy：スイートを ほかの アランの アプリで 買っている → どの カードにも 買う ボタンを 出さない。
function buildStoreCard(plan: Plan, activePlan: Plan, billing: BillingView, noBuy: boolean): HTMLElement {
  const isActive = plan === activePlan;
  const card = document.createElement("div");
  planCardShell(card, plan, activePlan);
  card.classList.add("family-store-card");
  if (noBuy) return card;

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

  const buys = document.createElement("div");
  buys.className = "family-plan-buys";
  (["monthly", "yearly"] as Period[]).forEach((period) => {
    const id = productId(plan, period);
    const price = billing.prices?.[id];
    const unit = period === "monthly" ? "月" : "年";
    const current = id === billing.currentProduct;
    const buy = document.createElement("button");
    buy.className = `family-plan-buy${current ? " current" : ""}`;
    buy.dataset.buy = id;
    // お店の 値段が まだ（null）・ない（いまは 売っていない）ときは きまった 値段を 見せて 押せない
    const shown = price ?? fallbackPrice(id);
    buy.textContent = !shown ? "—" : `${current ? "✓ " : ""}${shown}/${unit}`;
    // The price after the trial stays on the button, so the terms are clear.
    const trial = price && !current ? billing.trials?.[id] : undefined;
    if (trial) {
      const tag = document.createElement("span");
      tag.className = "family-plan-trial";
      tag.dataset.trial = id;
      tag.textContent = `${trial} 無料`;
      buy.textContent = `そのあと ${price}/${unit}`;
      buy.prepend(tag);
    }
    buy.setAttribute("aria-label", `${PLAN_META[plan].label} ${unit}ごと${trial ? ` ${trial}無料、そのあと` : ""}${shown ? ` ${shown}` : ""}${current ? "（いまのプラン）" : ""}`);
    buy.disabled = billing.busy || current || !price;
    buy.addEventListener("click", () => billing.onBuy(id));
    buys.append(buy);
  });
  card.append(buys);
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
  legal.textContent = "プレミアム・ファミリー・アランのスイートは自動更新のサブスクリプションです（1か月または1年）。"
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
    ? `${activeName} の${COPY.belt}はメニューごと。いま使っているメニューの${COPY.belt}だけが出ます。ぜんぶの種目が Lv.10 になると上がります。ここで変えると積み重ねは0から。`
    : `メニューをえらぶと、そのメニューの${COPY.belt}を変えられます。`;

  const list = document.createElement("div");
  list.className = "family-class-list";
  list.dataset.beltList = "";

  deps.menuBelts.forEach((mb) => {
    const row = document.createElement("div");
    row.className = "family-belt-row";
    row.dataset.beltRow = mb.id;

    const name = document.createElement("div");
    name.className = "family-section-label family-belt-title";
    name.textContent = `${mb.name}の${COPY.belt}を変える`;

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
  note.textContent = `チェックすると、${COPY.practice}のあとに練習動画を連携するボタンを表示します。`;

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

// Per-active-member おたより: a box to write one, 「おくる」 to put it in the
// kid's queue, and the recent letters underneath with よんだ / まだ so the parent
// can tell whether the last one landed. Writing no longer overwrites: the kid
// gets a new ✉️ each time. Returns [] when the wiring is absent.
function buildLetterSection(deps: FamilyDeps): Node[] {
  if (!deps.onSendLetter || !deps.letters) return [];
  const onSend = deps.onSendLetter;
  const letters = deps.letters;
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "おたより";

  const note = document.createElement("div");
  note.className = "family-comment-note";
  note.textContent = `${activeName} へのメッセージ（${LETTER_MAX_LEN}文字まで・あたらしい${LETTER_KEEP}通がのこります）`;

  const wrap = document.createElement("div");
  wrap.className = "family-comment-list";
  wrap.dataset.commentList = "";

  // Two lines: [text……] [おくる] / by [name].
  const row = document.createElement("div");
  row.className = "family-comment-row";

  const input = document.createElement("input");
  input.className = "family-comment-input";
  input.dataset.letterText = "";
  input.maxLength = LETTER_MAX_LEN;
  input.placeholder = "いつも がんばってるね";
  input.setAttribute("aria-label", "おたより");

  const byLab = document.createElement("label");
  byLab.className = "family-comment-label family-comment-by-label";
  byLab.textContent = "by";

  const byInput = document.createElement("input");
  byInput.className = "family-comment-input";
  byInput.dataset.letterBy = "";
  byInput.maxLength = LETTER_BY_MAX_LEN;
  // Whoever signed the last letter, so the parent types their name once.
  byInput.value = letters[0]?.by ?? "";
  byInput.placeholder = "おかあさん";

  const send = document.createElement("button");
  send.className = "family-comment-save";
  send.dataset.letterSend = "";
  send.textContent = "おくる";
  send.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) return;   // never post a blank 便箋
    onSend(text, byInput.value);
  });

  row.append(input, send, byLab, byInput);
  wrap.append(row);

  const sent = document.createElement("div");
  sent.className = "family-letter-sent";
  sent.dataset.letterSent = "";
  if (!letters.length) {
    const empty = document.createElement("div");
    empty.className = "family-letter-empty";
    empty.textContent = "まだ おたよりはありません";
    sent.append(empty);
  }
  letters.forEach((l) => {
    const item = document.createElement("div");
    item.className = "family-letter-item";
    item.dataset.letter = l.id;

    const state = document.createElement("span");
    state.className = "family-letter-state" + (l.readAt === undefined ? " is-unread" : "");
    state.dataset.letterState = "";
    state.textContent = l.readAt === undefined ? "まだ" : "よんだ";

    const text = document.createElement("span");
    text.className = "family-letter-text";
    text.textContent = l.by ? `${l.text}（${l.by}）` : l.text;

    item.append(state, text);
    if (deps.onDeleteLetter) {
      const del = document.createElement("button");
      del.className = "family-letter-delete";
      del.dataset.letterDelete = l.id;
      del.textContent = "けす";
      del.addEventListener("click", () => deps.onDeleteLetter!(l.id));
      item.append(del);
    }
    sent.append(item);
  });

  return [sectionTitle, note, wrap, sent];
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

// 「おうちの人のロック」: この家族タブの前に立つゲートの設定。
//
// ・暗証番号 — 決めるとかけ算の代わりにこれを聞く。親だけが知っている秘密なので
//   子が育っても破れない（かけ算は解けるようになったら終わり）。
// ・この iPhone はだれのもの — Face ID / 指紋 を近道にしていいかの判断。子ども
//   自身の端末なら登録されている顔も指紋も子どものものなので、近道は出さない。
// ・生体認証 — 上の2つがそろったときだけ出るチェック。
//
// 配線が無ければ [] を返す（ウェブ・古い呼び出し元）。
function buildParentLockSection(deps: FamilyDeps): Node[] {
  const lock = deps.parentLock;
  if (!lock) return [];

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "family-section-label";
  sectionTitle.textContent = "おうちの人のロック";

  const note = document.createElement("div");
  note.className = "family-plan-note";
  note.textContent = lock.hasPin
    ? "この画面をひらくとき、あんしょうばんごうを聞きます。"
    : "いまは かけ算の問題でまもっています。あんしょうばんごうを決めると、そちらを聞くようになります（お子さんが計算できるようになっても だいじょうぶ）。";

  const box = document.createElement("div");
  box.className = "family-lock-box";
  box.dataset.parentLock = "";

  // --- あんしょうばんごう ---
  const pinRow = document.createElement("div");
  pinRow.className = "family-lock-row";

  const pinInput = document.createElement("input");
  pinInput.type = "password";
  pinInput.className = "family-lock-pin";
  pinInput.dataset.lockPin = "";
  pinInput.setAttribute("inputmode", "numeric");
  pinInput.setAttribute("pattern", "[0-9]*");
  pinInput.setAttribute("autocomplete", "off");
  pinInput.maxLength = PIN_MAX_LEN;
  pinInput.placeholder = `${PIN_MIN_LEN}〜${PIN_MAX_LEN}けたの数字`;
  pinInput.setAttribute("aria-label", "あたらしい あんしょうばんごう");

  const pinSet = document.createElement("button");
  pinSet.type = "button";
  pinSet.className = "family-lock-set";
  pinSet.dataset.lockPinSet = "";
  pinSet.textContent = lock.hasPin ? "変える" : "決める";

  const pinErr = document.createElement("div");
  pinErr.className = "family-lock-error";
  pinErr.dataset.lockPinError = "";
  pinErr.hidden = true;
  pinErr.setAttribute("role", "alert");

  pinSet.addEventListener("click", () => {
    const problem = lock.onSetPin(pinInput.value);
    if (problem) {
      pinErr.hidden = false;
      pinErr.textContent = problem;
      return;
    }
    pinErr.hidden = true;
    pinInput.value = "";
  });

  pinRow.append(pinInput, pinSet);

  const pinHint = document.createElement("div");
  pinHint.className = "family-lock-hint";
  pinHint.textContent = "お子さんが知っている数字（たんじょう日など）は さけてください。わすれたときは、ゲートの「あんしょうばんごうを わすれた」から かけ算にもどせます。";

  box.append(pinRow, pinErr, pinHint);

  if (lock.hasPin) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "family-lock-clear";
    clear.dataset.lockPinClear = "";
    clear.textContent = "あんしょうばんごうを やめる（かけ算にもどす）";
    clear.addEventListener("click", () => { lock.onSetPin(null); });
    box.append(clear);
  }

  // --- この iPhone はだれのもの ---
  const ownerTitle = document.createElement("div");
  ownerTitle.className = "family-lock-subtitle";
  ownerTitle.textContent = "この iPhone はだれのもの？";

  const ownerRow = document.createElement("div");
  ownerRow.className = "family-lock-owners";
  ownerRow.dataset.lockOwner = "";

  ([["parent", "おうちの人のもの"], ["child", "子どものもの"]] as [DeviceOwner, string][])
    .forEach(([owner, label]) => {
      const opt = document.createElement("label");
      opt.className = "family-lock-owner";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "family-lock-owner";
      radio.value = owner;
      radio.dataset.lockOwnerOption = owner;
      radio.checked = lock.owner === owner;
      radio.addEventListener("change", () => { if (radio.checked) lock.onSetOwner(owner); });
      const text = document.createElement("span");
      text.textContent = label;
      opt.append(radio, text);
      ownerRow.append(opt);
    });

  box.append(ownerTitle, ownerRow);

  // --- Face ID / 指紋 の近道 ---
  if (lock.biometryLabel) {
    const bioRow = document.createElement("label");
    bioRow.className = "family-lock-row family-lock-bio";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.lockBiometrics = "";
    check.checked = lock.biometrics;
    // 暗証番号と「おうちの人のもの」がそろって初めて意味がある。
    check.disabled = !lock.hasPin || lock.owner !== "parent";
    check.addEventListener("change", () => lock.onSetBiometrics(check.checked));
    const text = document.createElement("span");
    text.textContent = `${lock.biometryLabel} でもひらけるようにする`;
    bioRow.append(check, text);

    const bioHint = document.createElement("div");
    bioHint.className = "family-lock-hint";
    bioHint.dataset.lockBioHint = "";
    bioHint.textContent = check.disabled
      ? `あんしょうばんごうを決めて、この iPhone を「おうちの人のもの」にすると使えます。${lock.biometryLabel} が答えるのは「この iPhone の持ち主か」までなので、お子さんの端末では近道になりません。`
      : `いつもは ${lock.biometryLabel}、うまくいかないときは あんしょうばんごうで ひらきます。`;

    box.append(bioRow, bioHint);
  }

  return [sectionTitle, note, box];
}
