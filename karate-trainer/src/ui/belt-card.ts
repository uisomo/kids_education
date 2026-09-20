// Belt card for the practice screen: the member's 帯 drawn as a small obi, its
// name, the rainbow 10-bar meter (the menu's lowest drill level) and what comes next.
// RPG belts (ほのお and up) get a gold frame and a light CSS shimmer.

import { BELTS, BARS_PER_BELT, type BeltState } from "../belt-store";
import { RAINBOW, rainbowGhost } from "./strength-screen";
import { COPY, IS_PIANO } from "../flavor";

// The obi itself: a band, two hanging tails and a knot, all painted with the
// belt's fill. Decorative — the name next to it carries the meaning.
export function createObi(index: number): HTMLElement {
  const belt = BELTS[index] ?? BELTS[0];
  const obi = document.createElement("div");
  // The piano app's levels are music notes (しろの音符, …): a ♫ instead of an obi.
  obi.className = `obi${IS_PIANO ? " note" : ""}${belt.rpg ? " rpg" : ""}`;
  obi.setAttribute("aria-hidden", "true");
  obi.style.setProperty("--obi-fill", belt.fill);
  obi.style.setProperty("--obi-ink", belt.ink);
  const parts = IS_PIANO
    ? ["note-beam", "note-stem left", "note-stem right", "note-head left", "note-head right"]
    : ["obi-band", "obi-tail left", "obi-tail right", "obi-knot"];
  for (const part of parts) {
    const el = document.createElement("span");
    el.className = part;
    obi.append(el);
  }
  return obi;
}

export function renderBeltCard(state: BeltState): HTMLElement {
  const belt = BELTS[state.index] ?? BELTS[0];
  const next = BELTS[state.index + 1] ?? null;

  const card = document.createElement("div");
  card.className = `belt-status-card${belt.rpg ? " rpg" : ""}`;
  card.dataset.beltCard = String(state.index);

  const body = document.createElement("div");
  body.className = "belt-body";

  const name = document.createElement("div");
  name.className = "belt-title";
  name.dataset.beltName = "";
  name.textContent = belt.icon ? `${belt.icon} ${belt.name}` : belt.name;

  const bars = document.createElement("div");
  bars.className = "belt-bars";
  for (let i = 0; i < BARS_PER_BELT; i++) {
    const bar = document.createElement("span");
    const lit = i < state.bars;
    bar.className = `belt-bar${lit ? " lit" : ""}`;
    // Unlit steps keep their own colour at a whisper (the card is white here,
    // so it needs a touch more than the dark 積み重ね rows).
    bar.style.background = lit ? RAINBOW[i] : rainbowGhost(i, 0.16);
    bars.append(bar);
  }

  const hint = document.createElement("div");
  hint.className = "belt-next";
  hint.dataset.beltNext = "";
  hint.textContent = next
    ? `ぜんぶの種目を Lv.${BARS_PER_BELT} にすると ${next.icon ? `${next.icon} ` : ""}${next.name}！`
    : `さいこうの${COPY.belt}！`;

  body.append(name, bars, hint);
  card.append(createObi(state.index), body);
  return card;
}
