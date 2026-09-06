// Drag-to-reorder for a vertical list of rows, driven by Pointer Events.
//
// Deliberately NOT the HTML5 drag-and-drop API: `dragstart` never fires on iOS
// Safari, and this app ships to iOS through Capacitor — HTML5 DnD would be dead
// on the actual device. Pointer Events cover mouse and touch with one path.
//
// The container is expected to hold `[data-row]` children, each containing one
// `[data-drag]` handle. Only the handle starts a drag, so the drill-name input
// in the same row stays tappable/selectable.

export interface DragReorderDeps {
  // Fired once, on release, only when the row actually changed slots.
  onReorder(from: number, to: number): void;
}

export interface RowMetric {
  top: number;
  height: number;
}

// Move `from` to `to`, where `to` indexes the list with the dragged item
// already removed. Always returns a new array.
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Where does the dragged row belong after travelling `offsetY` pixels?
// Walks the other rows in order and counts how many sit above the dragged
// row's centre — a row only yields once its own midpoint is crossed, which is
// what makes the swap feel settled rather than twitchy.
export function slotForOffset(
  rows: readonly RowMetric[],
  from: number,
  offsetY: number,
): number {
  const centre = rows[from].top + rows[from].height / 2 + offsetY;
  let to = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === from) continue;
    if (centre < rows[i].top + rows[i].height / 2) return to;
    to++;
  }
  return to;
}

export function attachDragReorder(container: HTMLElement, deps: DragReorderDeps): void {
  const rowsOf = () => Array.from(container.querySelectorAll<HTMLElement>("[data-row]"));

  container.addEventListener("pointerdown", (e: PointerEvent) => {
    const handle = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-drag]");
    if (!handle || !container.contains(handle)) return;
    const rowEls = rowsOf();
    const row = handle.closest<HTMLElement>("[data-row]");
    const from = row ? rowEls.indexOf(row) : -1;
    if (from < 0 || rowEls.length < 2) return;

    e.preventDefault();
    const metrics: RowMetric[] = rowEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    // Distance one row travels when it swaps: the pitch between neighbours
    // (height + the flex gap), so the placeholder animation lines up.
    const pitch = metrics.length > 1
      ? Math.abs(metrics[1].top - metrics[0].top)
      : metrics[0].height;

    const startY = e.clientY;
    let to = from;
    rowEls[from].classList.add("is-dragging");
    container.classList.add("is-reordering");
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / unsupported — the window listeners below still cover us */
    }

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      rowEls[from].style.transform = `translateY(${dy}px)`;
      to = slotForOffset(metrics, from, dy);
      // Shift the rows the dragged one has passed, so a gap opens where it lands.
      rowEls.forEach((el, i) => {
        if (i === from) return;
        let shift = 0;
        if (to > from && i > from && i <= to) shift = -pitch;
        else if (to < from && i >= to && i < from) shift = pitch;
        el.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      rowEls.forEach((el) => { el.style.transform = ""; });
      rowEls[from].classList.remove("is-dragging");
      container.classList.remove("is-reordering");
      if (to !== from) deps.onReorder(from, to);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });

  // Keyboard fallback on the same handle: reorder without a pointer gesture.
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const handle = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-drag]");
    if (!handle) return;
    const rowEls = rowsOf();
    const row = handle.closest<HTMLElement>("[data-row]");
    const from = row ? rowEls.indexOf(row) : -1;
    if (from < 0) return;
    const to = e.key === "ArrowUp" ? from - 1 : from + 1;
    if (to < 0 || to >= rowEls.length) return;
    e.preventDefault();
    deps.onReorder(from, to);
  });
}
