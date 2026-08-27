// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

it("renders a row per drill and fires onStart", () => {
  const root = document.createElement("div");
  const onStart = vi.fn();
  renderSetupScreen(root, { menu: structuredClone(DEFAULT_MENU), onChange: vi.fn(), onStart, onOpenVoice: vi.fn() });
  expect(root.querySelectorAll("[data-row]")).toHaveLength(DEFAULT_MENU.length);
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  expect(onStart).toHaveBeenCalledOnce();
});

it("adding a drill fires onChange with a longer menu", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, { menu: structuredClone(DEFAULT_MENU), onChange, onStart: vi.fn(), onOpenVoice: vi.fn() });
  root.querySelector<HTMLButtonElement>("[data-add]")!.click();
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0].length).toBe(DEFAULT_MENU.length + 1);
});

it("clicking down on first row swaps first two drills", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, { menu, onChange, onStart: vi.fn(), onOpenVoice: vi.fn() });
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
  renderSetupScreen(root, { menu, onChange, onStart: vi.fn(), onOpenVoice: vi.fn() });
  root.querySelector<HTMLButtonElement>("[data-up]")!.click();
  expect(onChange).not.toHaveBeenCalled();
});
