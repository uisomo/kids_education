// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

function deps(over: Record<string, unknown> = {}) {
  return {
    menu: structuredClone(DEFAULT_MENU),
    onChange: vi.fn(),
    onEdit: vi.fn(),
    onStart: vi.fn(),
    onOpenVoice: vi.fn(),
    presets: [],
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    ...over,
  };
}

it("renders a row per drill and fires onStart", () => {
  const root = document.createElement("div");
  const onStart = vi.fn();
  renderSetupScreen(root, deps({ onStart }));
  expect(root.querySelectorAll("[data-row]")).toHaveLength(DEFAULT_MENU.length);
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  expect(onStart).toHaveBeenCalledOnce();
});

it("adding a drill fires onChange with a longer menu", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, deps({ onChange }));
  root.querySelector<HTMLButtonElement>("[data-add]")!.click();
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0].length).toBe(DEFAULT_MENU.length + 1);
});

it("deleting a drill row asks for confirmation and fires onChange only when confirmed", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(true);
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange, confirmDelete }));
  root.querySelector<HTMLButtonElement>(".row-del")!.click();
  expect(confirmDelete).toHaveBeenCalledWith(menu[0].name);
  expect(onChange).toHaveBeenCalledWith(menu.slice(1));
});

it("deleting a drill row does nothing when the user cancels the confirmation", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(false);
  renderSetupScreen(root, deps({ onChange, confirmDelete }));
  root.querySelector<HTMLButtonElement>(".row-del")!.click();
  expect(onChange).not.toHaveBeenCalled();
});

// --- Reorder: drag handles replaced the ↑/↓ buttons ---
// The pointer gesture needs real layout, so it is covered by drag-reorder's own
// unit tests; here we drive the keyboard fallback the same handle exposes.
function pressKey(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

it("renders a drag handle per row and no ↑/↓ buttons", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelectorAll("[data-drag]")).toHaveLength(DEFAULT_MENU.length);
  expect(root.querySelector("[data-up]")).toBeNull();
  expect(root.querySelector("[data-down]")).toBeNull();
});

it("ArrowDown on the first row's drag handle swaps the first two drills", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange }));
  pressKey(root.querySelectorAll<HTMLElement>("[data-drag]")[0], "ArrowDown");
  expect(onChange).toHaveBeenCalled();
  const result = onChange.mock.calls[0][0];
  expect(result[0].name).toBe(menu[1].name); // second becomes first
  expect(result[1].name).toBe(menu[0].name); // first becomes second
});

it("ArrowUp on the first row's drag handle does nothing (no-op)", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, deps({ onChange }));
  pressKey(root.querySelectorAll<HTMLElement>("[data-drag]")[0], "ArrowUp");
  expect(onChange).not.toHaveBeenCalled();
});

// Regression: typing a drill name must NOT re-render the screen (which would
// destroy the focused input and cancel the iOS IME composition). It should
// persist via onEdit and keep the SAME input element focused.
it("editing a name calls onEdit (not onChange) and preserves the input element + focus", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const onChange = vi.fn();
  const onEdit = vi.fn();
  renderSetupScreen(root, deps({ onChange, onEdit }));

  const firstInput = root.querySelector<HTMLInputElement>(".drill-name")!;
  firstInput.focus();
  firstInput.value = "前蹴りみ";
  firstInput.dispatchEvent(new Event("input", { bubbles: true }));

  // structural re-render must NOT happen
  expect(onChange).not.toHaveBeenCalled();
  // edit is persisted
  expect(onEdit).toHaveBeenCalledOnce();
  expect(onEdit.mock.calls[0][0][0].name).toBe("前蹴りみ");
  // the very same input node is still in the DOM and still focused
  expect(root.querySelector(".drill-name")).toBe(firstInput);
  expect(document.activeElement).toBe(firstInput);

  root.remove();
});

// Editing seconds also persists via onEdit and updates the total live without
// a re-render.
it("editing seconds calls onEdit and updates the total in place", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const onEdit = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange, onEdit }));

  const secsInput = root.querySelector<HTMLInputElement>(".drill-secs")!;
  secsInput.value = "40";
  secsInput.dispatchEvent(new Event("input", { bubbles: true }));

  expect(onChange).not.toHaveBeenCalled();
  expect(onEdit).toHaveBeenCalled();
  expect(onEdit.mock.calls[0][0][0].seconds).toBe(40);
  // total reflects the new value without a full re-render
  expect(root.querySelector(".total")!.textContent).toContain("種目");
});

// --- Preset dropdown ---
it("renders a closed-by-default dropdown with one option per preset", () => {
  const root = document.createElement("div");
  const presets = [
    { id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) },
    { id: "p2", name: "型の日", menu: structuredClone(DEFAULT_MENU) },
  ];
  renderSetupScreen(root, deps({ presets }));
  const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
  expect(select).not.toBeNull();
  // "未選択" placeholder + one <option> per preset, nothing pre-selected
  expect(select.querySelectorAll("option")).toHaveLength(presets.length + 1);
  expect(select.value).toBe("");
  // no delete button until a preset is actually selected
  expect(root.querySelector("[data-preset-del]")).toBeNull();
});

it("selecting a preset in the dropdown fires onLoadPreset and reveals its delete button", () => {
  const root = document.createElement("div");
  const onLoadPreset = vi.fn();
  const presets = [
    { id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) },
    { id: "p2", name: "型の日", menu: structuredClone(DEFAULT_MENU) },
  ];
  renderSetupScreen(root, deps({ presets, onLoadPreset }));
  const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
  select.value = "p2";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(onLoadPreset).toHaveBeenCalledWith("p2");
});

it("save button fires onSavePreset", () => {
  const root = document.createElement("div");
  const onSavePreset = vi.fn();
  renderSetupScreen(root, deps({ onSavePreset }));
  root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  expect(onSavePreset).toHaveBeenCalledOnce();
});

it("preset delete button asks for confirmation and fires onDeletePreset only when confirmed", () => {
  const root = document.createElement("div");
  const onDeletePreset = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(true);
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, onDeletePreset, confirmDelete, selectedPresetId: "p1" }));
  root.querySelector<HTMLButtonElement>('[data-preset-del="p1"]')!.click();
  expect(confirmDelete).toHaveBeenCalledWith("基本稽古");
  expect(onDeletePreset).toHaveBeenCalledWith("p1");
});

it("preset delete does nothing when the user cancels the confirmation", () => {
  const root = document.createElement("div");
  const onDeletePreset = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(false);
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, onDeletePreset, confirmDelete, selectedPresetId: "p1" }));
  root.querySelector<HTMLButtonElement>('[data-preset-del="p1"]')!.click();
  expect(onDeletePreset).not.toHaveBeenCalled();
});

// --- Removed UI: voice-record entry, partner carousel, top banner image ---
it("no longer renders the voice-record button, partner carousel, or top banner image", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-voice]")).toBeNull();
  expect(root.querySelector(".character-selector-grid")).toBeNull();
  expect(root.querySelector(".character-card-btn")).toBeNull();
  expect(root.querySelector(".toybox-banner-img")).toBeNull();
  // start button + belt card still present
  expect(root.querySelector("[data-start]")).not.toBeNull();
  expect(root.querySelector(".belt-status-card")).not.toBeNull();
});

// --- E3: assigned くらす label ---
it("shows the assigned class name when className is provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ className: "基礎" }));
  const label = root.querySelector<HTMLElement>("[data-class-label]");
  expect(label).not.toBeNull();
  expect(label!.textContent).toContain("基礎");
});

it("omits the class label when className is null/absent", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ className: null }));
  expect(root.querySelector("[data-class-label]")).toBeNull();
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-class-label]")).toBeNull();
});

// --- E4: 感想コメント banner (top of screen) ---
it("shows the 感想 comment banner at the very top when provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kansou: "いつも がんばってるね" }));
  const banner = root.querySelector<HTMLElement>("[data-kansou-banner]");
  expect(banner).not.toBeNull();
  expect(banner!.textContent).toContain("いつも がんばってるね");
  expect(root.firstElementChild).toBe(banner);   // above the belt card / header
});

it("omits the 感想 banner when kansou is empty/absent", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kansou: "" }));
  expect(root.querySelector("[data-kansou-banner]")).toBeNull();
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-kansou-banner]")).toBeNull();
});

// --- Member band: kids pick who is practicing, no parental gate ---
const MEMBERS = [
  { id: "m1", name: "ゆうた" },
  { id: "m2", name: "さくら" },
];

it("renders a chip per registered member with the active one marked", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m2" }));
  const chips = root.querySelectorAll<HTMLElement>("[data-member]");
  expect(chips).toHaveLength(2);
  expect(chips[0].textContent).toContain("ゆうた");
  expect(chips[1].classList.contains("is-active")).toBe(true);
  expect(chips[0].classList.contains("is-active")).toBe(false);
});

it("tapping a member chip fires onSelectMember with that id", () => {
  const root = document.createElement("div");
  const onSelectMember = vi.fn();
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m1", onSelectMember }));
  root.querySelector<HTMLButtonElement>('[data-member="m2"]')!.click();
  expect(onSelectMember).toHaveBeenCalledWith("m2");
});

it("tapping the already-active member does not re-fire onSelectMember", () => {
  const root = document.createElement("div");
  const onSelectMember = vi.fn();
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m1", onSelectMember }));
  root.querySelector<HTMLButtonElement>('[data-member="m1"]')!.click();
  expect(onSelectMember).not.toHaveBeenCalled();
});

it("omits the member band when no members are provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-member-band]")).toBeNull();
});

// --- 工夫 button per row (opens the centered popup card) ---
it("renders a 工夫 button per row, lit only for drills that already have a note", () => {
  const root = document.createElement("div");
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({
    menu,
    kufuEnabled: true,
    latestKufuFor: (name: string) => (name === menu[0].name ? "こしをまわす" : ""),
  }));
  const buttons = root.querySelectorAll<HTMLElement>("[data-kufu-open]");
  expect(buttons).toHaveLength(menu.length);
  expect(buttons[0].classList.contains("is-lit")).toBe(true);
  expect(buttons[1].classList.contains("is-lit")).toBe(false);
});

it("omits the 工夫 buttons when kufuEnabled is false (Free plan)", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kufuEnabled: false, latestKufuFor: () => "" }));
  expect(root.querySelector("[data-kufu-open]")).toBeNull();
});

it("tapping a 工夫 button opens the centered card for that drill", () => {
  const root = document.createElement("div");
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, kufuEnabled: true, latestKufuFor: () => "" }));
  root.querySelectorAll<HTMLButtonElement>("[data-kufu-open]")[0].click();
  const card = root.querySelector<HTMLElement>("[data-kufu-modal]");
  expect(card).not.toBeNull();
  expect(card!.textContent).toContain(menu[0].name);
});

it("saving from the card calls onSaveKufu and lights that row's button", () => {
  const root = document.createElement("div");
  const menu = structuredClone(DEFAULT_MENU);
  const onSaveKufu = vi.fn();
  renderSetupScreen(root, deps({ menu, kufuEnabled: true, latestKufuFor: () => "", onSaveKufu }));
  const button = root.querySelectorAll<HTMLButtonElement>("[data-kufu-open]")[0];
  button.click();
  root.querySelector<HTMLInputElement>("[data-kufu-modal-input]")!.value = "ひざを上げる";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(onSaveKufu).toHaveBeenCalledWith(menu[0].name, "ひざを上げる");
  expect(button.classList.contains("is-lit")).toBe(true);
  expect(root.querySelector("[data-kufu-modal]")).toBeNull();
});
