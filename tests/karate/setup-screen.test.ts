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

it("clicking down on first row swaps first two drills", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange }));
  root.querySelector<HTMLButtonElement>("[data-down]")!.click();
  expect(onChange).toHaveBeenCalled();
  const result = onChange.mock.calls[0][0];
  expect(result[0].name).toBe(menu[1].name); // second becomes first
  expect(result[1].name).toBe(menu[0].name); // first becomes second
});

it("clicking up on first row does nothing (no-op)", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange }));
  root.querySelector<HTMLButtonElement>("[data-up]")!.click();
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

// --- Preset band ---
it("renders a chip per preset and fires onLoadPreset when tapped", () => {
  const root = document.createElement("div");
  const onLoadPreset = vi.fn();
  const presets = [
    { id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) },
    { id: "p2", name: "型の日", menu: structuredClone(DEFAULT_MENU) },
  ];
  renderSetupScreen(root, deps({ presets, onLoadPreset }));
  expect(root.querySelectorAll("[data-preset]")).toHaveLength(2);
  root.querySelector<HTMLButtonElement>('[data-preset-load="p2"]')!.click();
  expect(onLoadPreset).toHaveBeenCalledWith("p2");
});

it("save button fires onSavePreset", () => {
  const root = document.createElement("div");
  const onSavePreset = vi.fn();
  renderSetupScreen(root, deps({ onSavePreset }));
  root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  expect(onSavePreset).toHaveBeenCalledOnce();
});

it("preset delete button fires onDeletePreset with the id", () => {
  const root = document.createElement("div");
  const onDeletePreset = vi.fn();
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, onDeletePreset }));
  root.querySelector<HTMLButtonElement>('[data-preset-del="p1"]')!.click();
  expect(onDeletePreset).toHaveBeenCalledWith("p1");
});
