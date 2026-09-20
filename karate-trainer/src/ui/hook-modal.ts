// 🪝 The hook editor, as a popup.
//
// The words the child reads out loud before the practice starts used to be
// three boxes wedged into the sticky start row, which crowded 稽古 開始 on a
// phone. Tapping 🪝 now opens this card instead: three lines, nothing left on
// the setup screen when the hook is off.
//
// Like the 工夫 card, it only reports edits — the caller persists them
// (hook-store) as they are typed, so nothing is lost if the card is dismissed.

import { MAX_TEXT_LINES, MAX_TEXT_CHARS, clampChars } from "../drill-texts";

export interface HookModalDeps {
  // Raw stored text: one line per row, newline separated.
  text: string;
  // Called on every keystroke (already clamped to MAX_TEXT_CHARS per line).
  onEditText(text: string): void;
  // 「つかわない」: turn the hook off. The caller re-renders, which closes this.
  onTurnOff(): void;
  onClose?(): void;
}

// Two sentences, kept on their own lines: WebKit otherwise breaks Japanese
// anywhere and split 「なににする？」 across the wrap.
const TITLE_LINES = ["さいしょに出てくる言葉だよ。", "なににする？"];

// Renders the card into `host` and returns a close() that is safe to call more
// than once. Opening a second card replaces the first.
export function openHookModal(host: HTMLElement, deps: HookModalDeps): () => void {
  host.querySelectorAll("[data-hook-modal]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay hook-modal-overlay";
  overlay.dataset.hookModal = "";

  const card = document.createElement("div");
  card.className = "kufu-card hook-modal-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  TITLE_LINES.forEach((t, i) => {
    const line = document.createElement("div");
    line.textContent = t;
    if (i > 0) line.className = "hook-modal-title-ask";
    title.append(line);
  });

  const lines: HTMLInputElement[] = [];
  const saved = (deps.text ?? "").split("\n");
  const save = () => deps.onEditText(lines.map((l) => l.value).join("\n").replace(/\n+$/, ""));

  const rows = document.createElement("div");
  rows.className = "hook-modal-lines";

  for (let i = 0; i < MAX_TEXT_LINES; i++) {
    const row = document.createElement("label");
    row.className = "hook-modal-row";

    const label = document.createElement("span");
    label.className = "hook-modal-label";
    label.textContent = `${i + 1}ぎょうめ`;

    const line = document.createElement("input");
    line.type = "text";
    line.className = "hook-line hook-modal-line";
    line.dataset.hookLine = String(i);
    line.value = clampChars(saved[i] ?? "");
    line.placeholder = `${MAX_TEXT_CHARS}もじまで`;
    line.setAttribute("aria-label", `さいしょに読み上げる ことば ${i + 1}行目`);
    // Saved as it is typed (no re-render, so the IME stays intact). Clamped by
    // characters — maxLength counts an emoji as 2 — and never mid conversion.
    line.addEventListener("input", (e) => {
      if (!(e as InputEvent).isComposing) line.value = clampChars(line.value);
      save();
    });
    line.addEventListener("compositionend", () => {
      line.value = clampChars(line.value);
      save();
    });

    lines.push(line);
    row.append(label, line);
    rows.append(row);
  }

  const actions = document.createElement("div");
  actions.className = "kufu-card-actions hook-modal-actions";

  const offBtn = document.createElement("button");
  offBtn.type = "button";
  offBtn.className = "hook-modal-off";
  offBtn.dataset.hookOff = "";
  offBtn.textContent = "つかわない";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "kufu-card-save hook-modal-ok";
  okBtn.dataset.hookModalClose = "";
  okBtn.textContent = "これでOK";

  actions.append(offBtn, okBtn);
  card.append(title, rows, actions);
  overlay.append(card);
  host.append(overlay);

  let closed = false;
  let observer: MutationObserver | null = null;
  const close = (): void => {
    if (closed) return;
    closed = true;
    // The observer can fire after a test environment is torn down.
    if (typeof document !== "undefined") document.removeEventListener("keydown", onKey);
    observer?.disconnect();
    observer = null;
    overlay.remove();
    deps.onClose?.();
  };

  // Only auto-close on detachment if the card was ever in the document.
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

  okBtn.addEventListener("click", close);
  // Turning the hook off re-renders the setup screen, which detaches this card;
  // close first so the observer has nothing to do.
  offBtn.addEventListener("click", () => { close(); deps.onTurnOff(); });

  lines[0]?.focus();
  return close;
}
