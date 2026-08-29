// 家族 screen (Tower E). E1: member management — list members, add/remove, and
// select the active member via a dropdown. E2 (plans), E3 (class assignment),
// and E4 (応援コメント) build on this screen later.

import type { Member } from "../member-store";
import { type Plan, PLAN_LIMITS, PLAN_META } from "../plan-store";

export interface FamilyDeps {
  members: Member[];
  activeId: string;
  onAddMember(name: string): void;
  onRemoveMember(id: string): void;
  onSelectMember(id: string): void;
  activePlan: Plan;             // the active member's current plan
  onSelectPlan(plan: Plan): void;
}

const PLAN_ORDER: Plan[] = ["free", "standard", "max"];

const NAME_MAX_LEN = 12;

export function renderFamilyScreen(root: HTMLElement, deps: FamilyDeps): void {
  root.textContent = "";
  root.className = "screen family";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "家族";

  // --- Active member selector ---
  const activeCard = document.createElement("div");
  activeCard.className = "family-active-card";

  const activeLabel = document.createElement("label");
  activeLabel.className = "family-label";
  activeLabel.textContent = "いま つかう人";

  const select = document.createElement("select");
  select.className = "family-select";
  select.dataset.memberSelect = "";
  deps.members.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === deps.activeId) opt.selected = true;
    select.append(opt);
  });
  select.addEventListener("change", () => deps.onSelectMember(select.value));

  activeCard.append(activeLabel, select);

  // --- Member list with remove buttons ---
  const listTitle = document.createElement("div");
  listTitle.className = "family-section-label";
  listTitle.textContent = "メンバー";

  const list = document.createElement("div");
  list.className = "family-member-list";
  list.dataset.memberList = "";
  deps.members.forEach((m) => {
    const row = document.createElement("div");
    row.className = `family-member-row${m.id === deps.activeId ? " active" : ""}`;
    row.dataset.memberRow = m.id;

    const name = document.createElement("span");
    name.className = "family-member-name";
    name.textContent = m.name;

    const del = document.createElement("button");
    del.className = "family-member-del";
    del.dataset.memberDel = m.id;
    del.textContent = "✕";
    del.setAttribute("aria-label", `${m.name} を削除`);
    del.disabled = deps.members.length <= 1;   // can't remove the last member
    del.addEventListener("click", () => deps.onRemoveMember(m.id));

    row.append(name, del);
    list.append(row);
  });

  // --- Add member ---
  const addRow = document.createElement("div");
  addRow.className = "family-add-row";

  const nameInput = document.createElement("input");
  nameInput.className = "family-add-input";
  nameInput.dataset.memberAddInput = "";
  nameInput.maxLength = NAME_MAX_LEN;
  nameInput.placeholder = "なまえ";

  const addBtn = document.createElement("button");
  addBtn.className = "family-add-btn";
  addBtn.dataset.memberAdd = "";
  addBtn.textContent = "＋ 追加";
  addBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    deps.onAddMember(name);
  });

  addRow.append(nameInput, addBtn);

  // --- Plan / upgrade section (per active member) ---
  const planTitle = document.createElement("div");
  planTitle.className = "family-section-label";
  planTitle.textContent = "プラン";

  const planNote = document.createElement("div");
  planNote.className = "family-plan-note";
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";
  planNote.textContent = `${activeName} のプラン（1人ごと）`;

  const planCards = document.createElement("div");
  planCards.className = "family-plan-cards";
  planCards.dataset.planCards = "";

  PLAN_ORDER.forEach((plan) => {
    const meta = PLAN_META[plan];
    const limits = PLAN_LIMITS[plan];
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
    price.textContent = meta.price;

    const feats = document.createElement("div");
    feats.className = "family-plan-feats";
    const kufuText = limits.kufu === 0 ? "工夫なし" : `工夫 ${limits.kufu}件`;
    feats.textContent = `メニュー ${limits.presets}・${kufuText}`;

    if (isActive) {
      const badge = document.createElement("div");
      badge.className = "family-plan-badge";
      badge.textContent = "いま";
      card.append(badge);
    }

    card.append(name, price, feats);
    card.addEventListener("click", () => deps.onSelectPlan(plan));
    planCards.append(card);
  });

  root.append(title, activeCard, listTitle, list, addRow, planTitle, planNote, planCards);
}
