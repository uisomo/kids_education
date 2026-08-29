// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { renderFamilyScreen } from "../../karate-trainer/src/ui/family-screen";

const members = [{ id: "m1", name: "じぶん" }, { id: "m2", name: "たろう" }];

function deps(over: Record<string, unknown> = {}) {
  return {
    members, activeId: "m1",
    onAddMember: vi.fn(), onRemoveMember: vi.fn(), onSelectMember: vi.fn(),
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
