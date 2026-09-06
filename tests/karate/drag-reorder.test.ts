// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import {
  reorder,
  slotForOffset,
  attachDragReorder,
} from "../../karate-trainer/src/ui/drag-reorder";

const L = ["a", "b", "c", "d"] as const;

// --- reorder(): the pure list transform the gesture ends in ---
it("reorder moves an item down", () => {
  expect(reorder(L, 0, 2)).toEqual(["b", "c", "a", "d"]);
});

it("reorder moves an item up", () => {
  expect(reorder(L, 3, 1)).toEqual(["a", "d", "b", "c"]);
});

it("reorder to the same slot returns an equal copy, not the same array", () => {
  const out = reorder(L, 1, 1);
  expect(out).toEqual([...L]);
  expect(out).not.toBe(L);
});

// --- slotForOffset(): pointer travel → destination index ---
// Three 40px rows on a 50px pitch (10px gap), midpoints at 20 / 70 / 120.
const ROWS = [
  { top: 0, height: 40 },
  { top: 50, height: 40 },
  { top: 100, height: 40 },
];

it("no pointer travel keeps the row in its own slot", () => {
  expect(slotForOffset(ROWS, 0, 0)).toBe(0);
  expect(slotForOffset(ROWS, 1, 0)).toBe(1);
  expect(slotForOffset(ROWS, 2, 0)).toBe(2);
});

it("dragging down only swaps once the next row's midpoint is crossed", () => {
  expect(slotForOffset(ROWS, 0, 45)).toBe(0);  // centre 65, midpoint 70 — not yet
  expect(slotForOffset(ROWS, 0, 55)).toBe(1);  // centre 75 — crossed
});

it("dragging up only swaps once the previous row's midpoint is crossed", () => {
  expect(slotForOffset(ROWS, 2, -45)).toBe(2); // centre 75, midpoint 70 — not yet
  expect(slotForOffset(ROWS, 2, -55)).toBe(1); // centre 65 — crossed
});

it("dragging far past either end clamps to the first / last slot", () => {
  expect(slotForOffset(ROWS, 0, 999)).toBe(2);
  expect(slotForOffset(ROWS, 2, -999)).toBe(0);
});

// --- attachDragReorder(): keyboard path ---
// The pointer gesture needs real layout (jsdom reports every rect as 0), so the
// geometry is covered by slotForOffset above and the feel is verified in a real
// browser. The keyboard fallback IS testable here — and it is the a11y path.
function buildRows(n: number): HTMLElement {
  const container = document.createElement("div");
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.dataset.row = "";
    const handle = document.createElement("button");
    handle.dataset.drag = "";
    row.append(handle);
    container.append(row);
  }
  return container;
}

function pressKey(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

it("ArrowDown on a handle reorders that row one slot down", () => {
  const container = buildRows(3);
  const onReorder = vi.fn();
  attachDragReorder(container, { onReorder });
  pressKey(container.querySelectorAll<HTMLElement>("[data-drag]")[0], "ArrowDown");
  expect(onReorder).toHaveBeenCalledWith(0, 1);
});

it("ArrowUp on a handle reorders that row one slot up", () => {
  const container = buildRows(3);
  const onReorder = vi.fn();
  attachDragReorder(container, { onReorder });
  pressKey(container.querySelectorAll<HTMLElement>("[data-drag]")[2], "ArrowUp");
  expect(onReorder).toHaveBeenCalledWith(2, 1);
});

it("ArrowUp on the first row and ArrowDown on the last are no-ops", () => {
  const container = buildRows(3);
  const onReorder = vi.fn();
  attachDragReorder(container, { onReorder });
  const handles = container.querySelectorAll<HTMLElement>("[data-drag]");
  pressKey(handles[0], "ArrowUp");
  pressKey(handles[2], "ArrowDown");
  expect(onReorder).not.toHaveBeenCalled();
});

it("ignores keys other than the arrows", () => {
  const container = buildRows(3);
  const onReorder = vi.fn();
  attachDragReorder(container, { onReorder });
  pressKey(container.querySelector<HTMLElement>("[data-drag]")!, "Enter");
  expect(onReorder).not.toHaveBeenCalled();
});
