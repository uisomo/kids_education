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
  renderFamilyScreen(root, deps({ activePlan: "standard" }));
  const cards = root.querySelectorAll("[data-plan-card]");
  expect(cards).toHaveLength(3);   // free / standard / max
  expect(root.querySelector('[data-plan-card="standard"]')!.classList.contains("active")).toBe(true);
  expect(root.querySelector('[data-plan-card="free"]')!.classList.contains("active")).toBe(false);
});

it("tapping a plan card fires onSelectPlan with that plan", () => {
  const root = document.createElement("div");
  const onSelectPlan = vi.fn();
  renderFamilyScreen(root, deps({ activePlan: "free", onSelectPlan }));
  root.querySelector<HTMLButtonElement>('[data-plan-card="max"]')!.click();
  expect(onSelectPlan).toHaveBeenCalledWith("max");
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

it("renders a class select per member with the assigned class selected", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, classDeps());
  const rows = root.querySelectorAll("[data-class-row]");
  expect(rows).toHaveLength(2);
  const m1 = root.querySelector<HTMLSelectElement>('[data-class-select="m1"]')!;
  expect(m1.value).toBe("p1");
  const m2 = root.querySelector<HTMLSelectElement>('[data-class-select="m2"]')!;
  expect(m2.value).toBe("");   // なし (unassigned)
});

it("changing a member's class fires onAssignClass with the preset id", () => {
  const root = document.createElement("div");
  const onAssignClass = vi.fn();
  renderFamilyScreen(root, classDeps({ onAssignClass }));
  const m2 = root.querySelector<HTMLSelectElement>('[data-class-select="m2"]')!;
  m2.value = "p2";
  m2.dispatchEvent(new Event("change"));
  expect(onAssignClass).toHaveBeenCalledWith("m2", "p2");
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

// --- E4: 応援コメント section (per active member) ---
function commentDeps(over: Record<string, unknown> = {}) {
  return deps({
    comments: { kansou: "がんばってるね", fight: "あと ちょっと" },
    onSaveComment: vi.fn(),
    ...over,
  });
}

it("renders 感想 / ファイト inputs prefilled with the active member's comments", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, commentDeps());
  const kansou = root.querySelector<HTMLInputElement>("[data-comment-kansou]")!;
  const fight = root.querySelector<HTMLInputElement>("[data-comment-fight]")!;
  expect(kansou.value).toBe("がんばってるね");
  expect(fight.value).toBe("あと ちょっと");
});

it("saving 感想 fires onSaveComment with kind and text", () => {
  const root = document.createElement("div");
  const onSaveComment = vi.fn();
  renderFamilyScreen(root, commentDeps({ onSaveComment }));
  const kansou = root.querySelector<HTMLInputElement>("[data-comment-kansou]")!;
  kansou.value = "だいすき";
  root.querySelector<HTMLButtonElement>("[data-comment-save-kansou]")!.click();
  expect(onSaveComment).toHaveBeenCalledWith("kansou", "だいすき");
});

it("saving ファイト fires onSaveComment with kind and text", () => {
  const root = document.createElement("div");
  const onSaveComment = vi.fn();
  renderFamilyScreen(root, commentDeps({ onSaveComment }));
  const fight = root.querySelector<HTMLInputElement>("[data-comment-fight]")!;
  fight.value = "まけるな";
  root.querySelector<HTMLButtonElement>("[data-comment-save-fight]")!.click();
  expect(onSaveComment).toHaveBeenCalledWith("fight", "まけるな");
});

it("omits the comment section for callers without comment wiring", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, deps());   // no comments/onSaveComment
  expect(root.querySelector("[data-comment-kansou]")).toBeNull();
  expect(root.querySelector("[data-comment-fight]")).toBeNull();
});
