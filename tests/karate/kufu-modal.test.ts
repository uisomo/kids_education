// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { openKufuModal, type KufuModalDeps } from "../../karate-trainer/src/ui/kufu-modal";

afterEach(() => { document.body.textContent = ""; });

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}

// A card over an in-memory list, with the plan's caps (3 per 種目 unless `full`).
function open(initial: string[] = [], over: Partial<KufuModalDeps> & { full?: boolean } = {}) {
  const root = host();
  const notes = [...initial];
  const onAdd = vi.fn((t: string) => { notes.unshift(t); });
  const onRemove = vi.fn((i: number) => { notes.splice(i, 1); });
  const onClose = vi.fn();
  const close = openKufuModal(root, {
    drillName: "前蹴り",
    notes: () => notes,
    canAdd: () => !over.full && notes.length < 3,
    onAdd, onRemove, onClose,
    perDrill: 3,
    ...over,
  });
  return { root, notes, onAdd, onRemove, onClose, close };
}

const overlay = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-kufu-modal]");
const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>("[data-kufu-modal-input]");
const save = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!;

it("renders a dialog card naming the drill, with a note when it has no 工夫", () => {
  const { root } = open();
  expect(root.querySelector(".kufu-card")!.getAttribute("role")).toBe("dialog");
  expect(root.textContent).toContain("前蹴り の 工夫");
  expect(root.textContent).toContain("まだ工夫がないよ");
});

it("lists the 工夫 newest first, each with its own けす that erases it and keeps the card open", () => {
  const { root, onRemove, notes } = open(["こし", "ひざ"]);
  const rows = root.querySelectorAll("[data-kufu-note]");
  expect([...rows].map((r) => r.querySelector("span")!.textContent)).toEqual(["こし", "ひざ"]);
  root.querySelector<HTMLButtonElement>('[data-kufu-modal-remove="1"]')!.click();
  expect(onRemove).toHaveBeenCalledWith(1);
  expect(notes).toEqual(["こし"]);
  expect(overlay(root)).not.toBeNull();
  expect(root.querySelectorAll("[data-kufu-note]")).toHaveLength(1);
});

it("saving adds the trimmed text (15 chars max) and keeps the card open with an empty box", () => {
  const { root, onAdd, onClose } = open();
  input(root)!.value = `  ${"あ".repeat(30)}  `;
  save(root).click();
  expect(onAdd).toHaveBeenCalledWith("あ".repeat(15));
  expect(overlay(root)).not.toBeNull();
  expect(root.querySelectorAll("[data-kufu-note]")).toHaveLength(1);
  expect(input(root)!.value).toBe("");
  expect(onClose).not.toHaveBeenCalled();

  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(overlay(root)).toBeNull();
  expect(onClose).toHaveBeenCalledWith(true);
});

it("saving the 3rd 工夫 swaps the box for the per-種目 hint, still open", () => {
  const { root } = open(["a", "b"]);
  input(root)!.value = "c";
  save(root).click();
  expect(overlay(root)).not.toBeNull();
  expect(input(root)).toBeNull();
  expect(root.querySelector("[data-kufu-modal-full]")).not.toBeNull();
});

it("saving an empty box does nothing", () => {
  const { root, onAdd } = open();
  input(root)!.value = "   ";
  save(root).click();
  expect(onAdd).not.toHaveBeenCalled();
  expect(overlay(root)).not.toBeNull();
});

it("with 3 工夫 the box is replaced by the per-種目 hint until one is erased", () => {
  const { root } = open(["a", "b", "c"]);
  expect(input(root)).toBeNull();
  expect(root.querySelector("[data-kufu-modal-full]")!.textContent).toContain("1種目3つまで");
  root.querySelector<HTMLButtonElement>('[data-kufu-modal-remove="0"]')!.click();
  expect(input(root)).not.toBeNull();
});

it("when the member's total is used up it says to erase another 種目's 工夫", () => {
  const { root } = open(["a"], { full: true });
  expect(root.querySelector("[data-kufu-modal-full]")!.textContent).toContain("ほかの種目");
});

it("とじる closes; onClose says whether anything changed", () => {
  const a = open(["a"]);
  a.root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(overlay(a.root)).toBeNull();
  expect(a.onClose).toHaveBeenCalledWith(false);

  const b = open(["a"]);
  b.root.querySelector<HTMLButtonElement>('[data-kufu-modal-remove="0"]')!.click();
  b.root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(b.onClose).toHaveBeenCalledWith(true);
});

it("tapping beside the card or on it does not close it", () => {
  const { root } = open();
  root.querySelector<HTMLElement>(".kufu-card")!.click();
  overlay(root)!.click();
  expect(overlay(root)).not.toBeNull();
});

it("Escape closes the card and stops listening afterwards", () => {
  const { root, onClose } = open();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(overlay(root)).toBeNull();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("the returned close() removes the card and is safe to call twice", () => {
  const { root, close, onClose } = open();
  close();
  close();
  expect(overlay(root)).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("only one card exists at a time", () => {
  const root = host();
  const deps: KufuModalDeps = { drillName: "前蹴り", notes: () => [], canAdd: () => true, onAdd: vi.fn(), onRemove: vi.fn() };
  openKufuModal(root, deps);
  openKufuModal(root, { ...deps, drillName: "回し蹴り" });
  expect(root.querySelectorAll("[data-kufu-modal]")).toHaveLength(1);
  expect(root.querySelector(".kufu-card")!.textContent).toContain("回し蹴り");
});

it("closes (onClose runs) when the host re-renders underneath the card", async () => {
  const { root, onClose } = open();
  root.textContent = "";
  await new Promise((r) => setTimeout(r, 0));
  expect(onClose).toHaveBeenCalledTimes(1);
});
