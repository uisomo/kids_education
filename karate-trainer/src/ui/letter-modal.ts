// おたより card: the parent's message as a 便箋 (letter paper) over the page,
// opened from the ✉️ chip in the 特訓 header. One letter fills the card, so it
// reads like something written to the kid rather than a status bar; older ones
// are behind 「‹ まえのおたより」.
//
// Same manners as kufu-modal: only 「とじる」 (or Escape) closes it, a stray tap
// beside the card does nothing, and it cleans up if the screen re-renders
// underneath it.

import type { Letter } from "../letter-store";

export interface LetterModalDeps {
  letters: Letter[];          // newest first; must not be empty
  onRead?(id: string): void;  // the shown letter has now been seen
  onClose?(): void;
}

// 9月21日 — the day it was written, so a kept letter has a place in time.
function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function openLetterModal(host: HTMLElement, deps: LetterModalDeps): () => void {
  host.querySelectorAll("[data-letter-modal]").forEach((el) => el.remove());
  // Copied: the card marks what it shows as read in its own list too, so
  // flipping back to a letter does not ask the caller to store it twice.
  const letters = deps.letters.map((l) => ({ ...l }));
  if (!letters.length) return () => {};

  const overlay = document.createElement("div");
  overlay.className = "letter-overlay";
  overlay.dataset.letterModal = "";

  const card = document.createElement("div");
  card.className = "letter-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const day = document.createElement("div");
  day.className = "letter-card-day";
  day.dataset.letterDay = "";

  const body = document.createElement("div");
  body.className = "letter-card-text";
  body.dataset.letterText = "";

  const by = document.createElement("div");
  by.className = "letter-card-by";
  by.dataset.letterBy = "";

  const nav = document.createElement("div");
  nav.className = "letter-card-nav";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "letter-card-step";
  prev.dataset.letterPrev = "";
  prev.textContent = "‹ まえのおたより";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "letter-card-step";
  next.dataset.letterNext = "";
  next.textContent = "つぎ ›";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "letter-card-close";
  closeBtn.dataset.letterClose = "";
  closeBtn.textContent = "とじる";

  nav.append(prev, next);
  card.append(day, body, by, nav, closeBtn);
  overlay.append(card);
  host.append(overlay);

  // 0 = newest. Older letters are further down the list.
  let index = 0;
  let closed = false;
  let observer: MutationObserver | null = null;

  const paint = (): void => {
    const letter = letters[index];
    day.textContent = formatDay(letter.createdAt);
    body.textContent = letter.text;
    by.textContent = letter.by ? `by ${letter.by}` : "";
    by.hidden = !letter.by;
    // Seen the moment it is on the screen: the kid should not have to press
    // anything to stop the NEW badge from nagging.
    if (letter.readAt === undefined) {
      letter.readAt = Date.now();
      deps.onRead?.(letter.id);
    }
    prev.hidden = index >= letters.length - 1;
    next.hidden = index <= 0;
  };

  prev.addEventListener("click", () => { if (index < letters.length - 1) { index++; paint(); } });
  next.addEventListener("click", () => { if (index > 0) { index--; paint(); } });

  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    observer?.disconnect();
    observer = null;
    overlay.remove();
    deps.onClose?.();
  };
  closeBtn.addEventListener("click", close);

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

  paint();
  return close;
}
