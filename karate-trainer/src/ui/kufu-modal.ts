// 工夫 card: centred over the page, listing one drill's 工夫 (newest first, up
// to the plan's per-種目 cap) with 「けす」 on each, and a box to add one more.
// Opened from the 💡 button on a 今日の稽古 row and on the done screen. It stays
// open through saves and erases, and closes only with 「とじる」.
//
// The card only reports actions — persistence and the plan caps stay with the
// caller (kufu-store), which it re-asks after every change.

import { KUFU_MAX_LEN } from "../kufu-store";

export interface KufuModalDeps {
  drillName: string;
  notes(): string[];     // this drill's usable 工夫, newest first
  canAdd(): boolean;     // room for one more (per 種目 and in total)
  onAdd(text: string): void;
  onRemove(index: number): void;
  perDrill?: number;     // for the "full" hint
  // changed: whether anything was added or erased while the card was open.
  onClose?(changed: boolean): void;
}

// Renders the card into `host` and returns a close() that is safe to call more
// than once. Opening a second card replaces the first.
export function openKufuModal(host: HTMLElement, deps: KufuModalDeps): () => void {
  host.querySelectorAll("[data-kufu-modal]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay";
  overlay.dataset.kufuModal = "";

  const card = document.createElement("div");
  card.className = "kufu-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  title.textContent = `${deps.drillName} の 工夫`;

  const list = document.createElement("div");
  list.className = "kufu-card-list";
  list.dataset.kufuModalList = "";

  const composer = document.createElement("div");
  composer.className = "kufu-card-composer";

  const actions = document.createElement("div");
  actions.className = "kufu-card-actions";

  const closeBtn = document.createElement("button");
  closeBtn.className = "kufu-card-cancel";
  closeBtn.dataset.kufuModalClose = "";
  closeBtn.textContent = "とじる";
  actions.append(closeBtn);

  card.append(title, list, composer, actions);
  overlay.append(card);
  host.append(overlay);

  let changed = false;
  let closed = false;
  // Tracks removal by any means (e.g. the screen re-rendering underneath the
  // card): the document listener must not leak and onClose must still run.
  let observer: MutationObserver | null = null;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    observer?.disconnect();
    observer = null;
    overlay.remove();
    deps.onClose?.(changed);
  };

  // Redraws the list and the add box from the caller's current state.
  const paint = (): void => {
    const notes = deps.notes();
    list.textContent = "";
    if (!notes.length) {
      const empty = document.createElement("div");
      empty.className = "kufu-card-empty";
      empty.textContent = "まだ工夫がないよ";
      list.append(empty);
    }
    notes.forEach((text, i) => {
      const row = document.createElement("div");
      row.className = "kufu-card-note";
      row.dataset.kufuNote = String(i);
      const label = document.createElement("span");
      label.textContent = text;
      const erase = document.createElement("button");
      erase.className = "kufu-card-clear";
      erase.dataset.kufuModalRemove = String(i);
      erase.textContent = "けす";
      erase.addEventListener("click", () => {
        deps.onRemove(i);
        changed = true;
        paint();
      });
      row.append(label, erase);
      list.append(row);
    });

    composer.textContent = "";
    if (deps.canAdd()) {
      const hint = document.createElement("div");
      hint.className = "kufu-card-hint";
      hint.textContent = `つぎ どうする？（${KUFU_MAX_LEN}文字まで）`;

      const input = document.createElement("input");
      input.className = "kufu-card-input";
      input.dataset.kufuModalInput = "";
      input.maxLength = KUFU_MAX_LEN;
      input.placeholder = "こうしよう！";

      const save = document.createElement("button");
      save.className = "kufu-card-save";
      save.dataset.kufuModalSave = "";
      save.textContent = "ほぞん";

      const persist = (): void => {
        const text = input.value.trim().slice(0, KUFU_MAX_LEN);
        if (!text) return;
        deps.onAdd(text);
        changed = true;
        paint();   // stay open: the new 工夫 joins the list, the box is ready again
      };
      save.addEventListener("click", persist);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") persist(); });

      composer.append(hint, input, save);
      input.focus();
    } else {
      const full = document.createElement("div");
      full.className = "kufu-card-full";
      full.dataset.kufuModalFull = "";
      full.textContent = deps.perDrill !== undefined && notes.length >= deps.perDrill
        ? `工夫は1種目${deps.perDrill}つまで。けすと また書けるよ`
        : "工夫がいっぱい。ほかの種目の工夫をけすと書けるよ";
      composer.append(full);
    }
  };

  // Only auto-close on detachment if the card was ever in the document (a card
  // opened into a detached host is still closable via close()).
  const wasConnected = overlay.isConnected;
  const detached = (): boolean => wasConnected && !overlay.isConnected;

  function onKey(e: KeyboardEvent): void {
    if (detached()) { close(); return; }
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  if (wasConnected && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => { if (detached()) close(); });
    observer.observe(document, { childList: true, subtree: true });
  }

  // Only 「とじる」 closes (and Escape on a keyboard) — a stray tap beside the
  // card must not throw away what the child was doing.
  closeBtn.addEventListener("click", close);

  paint();
  return close;
}
