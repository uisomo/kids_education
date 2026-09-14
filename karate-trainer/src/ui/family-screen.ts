// 家族 screen (Tower E). E1: member management — list members, add/remove, and
// select the active member via a dropdown. E2 (plans), E3 (class assignment),
// and E4 (応援コメント) build on this screen later.

import type { Member } from "../member-store";
import type { Preset } from "../preset-store";
import { type Plan, PLAN_LIMITS, PLAN_META } from "../plan-store";

export interface FamilyDeps {
  members: Member[];
  activeId: string;
  onAddMember(name: string): void;
  onRemoveMember(id: string): void;
  onSelectMember(id: string): void;
  activePlan: Plan;             // the active member's current plan ("family" while Family is on)
  onSelectPlan(plan: Plan): void;
  // E3 くらす assignment. `classes` = the family-shared presets that can be
  // assigned; `assignments` maps memberId → assigned presetId (or null).
  // Optional so pre-E3 callers/tests keep working (section is hidden if absent).
  classes?: Preset[];
  assignments?: Record<string, string | null>;
  onAssignClass?(memberId: string, presetId: string | null): void;
  // E4 応援コメント (parent, for the active member). `comments` = the active
  // member's saved 感想 / ファイト messages. Optional so pre-E4 callers/tests keep
  // working (section is hidden if either is absent). Free on every plan.
  comments?: { kansou: string; fight: string };
  onSaveComment?(kind: "kansou" | "fight", text: string): void;
}

const PLAN_ORDER: Plan[] = ["free", "standard", "max", "family"];

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

  // --- Plan / upgrade section (per active member, or everyone on Family) ---
  const planTitle = document.createElement("div");
  planTitle.className = "family-section-label";
  planTitle.textContent = "プラン";

  const planNote = document.createElement("div");
  planNote.className = "family-plan-note";
  const activeName = deps.members.find((m) => m.id === deps.activeId)?.name ?? "";
  planNote.textContent = deps.activePlan === "family"
    ? "ファミリープラン（家族みんな）"
    : `${activeName} のプラン（1人ごと）`;

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
    const whoText = plan === "family" ? "\n家族みんな" : "";
    feats.textContent = `メニュー ${limits.presets}・${kufuText}${whoText}`;

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

  // --- くらす assignment section (E3) ---
  const classNodes = buildClassSection(deps);

  // --- 応援コメント section (E4, active member) ---
  const commentNodes = buildCommentSection(deps);

  root.append(title, activeCard, listTitle, list, addRow, ...classNodes, ...commentNodes, planTitle, planNote, planCards);
}

// Per-active-member 応援コメント: two labelled inputs (感想 / ファイト) each with a
// save button. Returns the nodes to append, or [] when E4 wiring is absent.
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

  const makeRow = (
    kind: "kansou" | "fight",
    label: string,
    placeholder: string,
  ): HTMLElement => {
    const row = document.createElement("div");
    row.className = "family-comment-row";

    const lab = document.createElement("label");
    lab.className = "family-comment-label";
    lab.textContent = label;

    const input = document.createElement("input");
    input.className = "family-comment-input";
    input.dataset[kind === "kansou" ? "commentKansou" : "commentFight"] = "";
    input.value = comments[kind];
    input.placeholder = placeholder;

    const save = document.createElement("button");
    save.className = "family-comment-save";
    save.dataset[kind === "kansou" ? "commentSaveKansou" : "commentSaveFight"] = "";
    save.textContent = "保存";
    save.addEventListener("click", () => onSave(kind, input.value));

    row.append(lab, input, save);
    return row;
  };

  wrap.append(
    makeRow("kansou", "感想", "いつも がんばってるね"),
    makeRow("fight", "ファイト", "あと ちょっと！"),
  );

  return [sectionTitle, note, wrap];
}

// Per-member くらす (class) assignment: each member gets a <select> of the
// family's saved menus (presets) plus a "なし" (unassigned) option. Returns the
// nodes to append, or [] when E3 wiring is absent (pre-E3 callers).
function buildClassSection(deps: FamilyDeps): Node[] {
  if (!deps.onAssignClass || !deps.classes || !deps.assignments) return [];
  const onAssign = deps.onAssignClass;
  const assignments = deps.assignments;
  const classes = deps.classes;

  const classTitle = document.createElement("div");
  classTitle.className = "family-section-label";
  classTitle.textContent = "くらす";

  // No saved menus yet → nothing to assign. Guide the parent to make one.
  if (classes.length === 0) {
    const hint = document.createElement("div");
    hint.className = "family-class-hint";
    hint.dataset.classHint = "";
    hint.textContent = "メニューを保存してくらすにしてね";
    return [classTitle, hint];
  }

  const classList = document.createElement("div");
  classList.className = "family-class-list";
  classList.dataset.classList = "";

  deps.members.forEach((m) => {
    const row = document.createElement("div");
    row.className = "family-class-row";
    row.dataset.classRow = m.id;

    const name = document.createElement("span");
    name.className = "family-class-member";
    name.textContent = m.name;

    const select = document.createElement("select");
    select.className = "family-class-select";
    select.dataset.classSelect = m.id;

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "なし";
    select.append(none);

    const assigned = assignments[m.id] ?? null;
    classes.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === assigned) opt.selected = true;
      select.append(opt);
    });
    if (assigned === null) none.selected = true;

    select.addEventListener("change", () => onAssign(m.id, select.value || null));

    row.append(name, select);
    classList.append(row);
  });

  return [classTitle, classList];
}
