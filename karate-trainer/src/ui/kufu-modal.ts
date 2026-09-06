// 工夫 popup: a card centred over the page where the child writes their idea
// for one drill. Opened from the 💡 button on a 今日の稽古 row (and reusable
// anywhere else a single drill's 工夫 needs editing).
//
// The card only reports the text — persistence (and the plan's 工夫 cap) stays
// with the caller, which routes it through kufu-store like the done screen does.

import { KUFU_MAX_LEN } from "../kufu-store";

export interface KufuModalDeps {
  drillName: string;
  current: string;          // latest saved 工夫 for this drill ("" when none)
  onSave(text: string): void;
  onClose?(): void;
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

  const hint = document.createElement("div");
  hint.className = "kufu-card-hint";
  hint.textContent = `つぎ どうする？（${KUFU_MAX_LEN}文字まで）`;

  const input = document.createElement("input");
  input.className = "kufu-card-input";
  input.dataset.kufuModalInput = "";
  input.maxLength = KUFU_MAX_LEN;
  input.placeholder = "こうしよう！";
  input.value = deps.current;

  const actions = document.createElement("div");
  actions.className = "kufu-card-actions";

  const save = document.createElement("button");
  save.className = "kufu-card-save";
  save.dataset.kufuModalSave = "";
  save.textContent = "ほぞん";

  const cancel = document.createElement("button");
  cancel.className = "kufu-card-cancel";
  cancel.dataset.kufuModalClose = "";
  cancel.textContent = "やめる";

  actions.append(save, cancel);
  card.append(title, hint, input, actions);
  overlay.append(card);
  host.append(overlay);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    deps.onClose?.();
  };

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  // Backdrop taps close; taps inside the card must not bubble out to it.
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const persist = (): void => {
    const text = input.value.trim().slice(0, KUFU_MAX_LEN);
    if (text) deps.onSave(text);
    close();
  };
  save.addEventListener("click", persist);
  cancel.addEventListener("click", close);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") persist(); });

  input.focus();
  return close;
}
