// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { openKufuModal } from "../../karate-trainer/src/ui/kufu-modal";

afterEach(() => { document.body.textContent = ""; });

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}

function open(over: Record<string, unknown> = {}) {
  const root = host();
  const onSave = vi.fn();
  const close = openKufuModal(root, {
    drillName: "前蹴り",
    current: "",
    onSave,
    ...over,
  });
  return { root, onSave, close };
}

const overlay = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-kufu-modal]");
const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>("[data-kufu-modal-input]")!;

it("renders a dialog card naming the drill", () => {
  const { root } = open();
  expect(overlay(root)).not.toBeNull();
  const card = root.querySelector<HTMLElement>(".kufu-card")!;
  expect(card.getAttribute("role")).toBe("dialog");
  expect(card.textContent).toContain("前蹴り");
});

it("prefills the input with the current 工夫", () => {
  const { root } = open({ current: "こしをまわす" });
  expect(input(root).value).toBe("こしをまわす");
});

it("saving passes the trimmed text and closes the card", () => {
  const { root, onSave } = open();
  input(root).value = "  ひざを上げる  ";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(onSave).toHaveBeenCalledWith("ひざを上げる");
  expect(overlay(root)).toBeNull();
});

it("caps the saved text at 15 characters", () => {
  const { root, onSave } = open();
  input(root).value = "あ".repeat(30);
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(onSave).toHaveBeenCalledWith("あ".repeat(15));
});

it("saving an empty input closes without calling onSave", () => {
  const { root, onSave } = open({ current: "まえのくふう" });
  input(root).value = "   ";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(onSave).not.toHaveBeenCalled();
  expect(overlay(root)).toBeNull();
});

it("the cancel button closes without saving", () => {
  const { root, onSave } = open();
  input(root).value = "すてる";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(onSave).not.toHaveBeenCalled();
  expect(overlay(root)).toBeNull();
});

it("tapping the backdrop closes, tapping the card does not", () => {
  const { root } = open();
  root.querySelector<HTMLElement>(".kufu-card")!.click();
  expect(overlay(root)).not.toBeNull();
  overlay(root)!.click();
  expect(overlay(root)).toBeNull();
});

it("Escape closes the card and stops listening afterwards", () => {
  const { root, onSave } = open();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(overlay(root)).toBeNull();
  // The document-level listener must be torn down with the card.
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(onSave).not.toHaveBeenCalled();
});

it("the returned close() removes the card and is safe to call twice", () => {
  const { root, close } = open();
  close();
  expect(overlay(root)).toBeNull();
  expect(() => close()).not.toThrow();
});

it("only one card exists at a time", () => {
  const root = host();
  const deps = { drillName: "前蹴り", current: "", onSave: vi.fn() };
  openKufuModal(root, deps);
  openKufuModal(root, { ...deps, drillName: "回し蹴り" });
  expect(root.querySelectorAll("[data-kufu-modal]")).toHaveLength(1);
  expect(root.querySelector(".kufu-card")!.textContent).toContain("回し蹴り");
});
