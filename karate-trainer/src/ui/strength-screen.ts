// 積み重ね screen: the picked saved menu's 帯 and each of its drills' level. A drill
// levels up once per practice it finishes (0..10), shown as Lv.N and N lit
// bars going red→purple. The belt's bars are the lowest drill level (see
// menu-belt-store), so the card on top moves only when the weakest drill does.

import type { Menu } from "../types";
import { loadMenuBelt, levelOf, beltStateFor, drillNames, MAX_LEVEL } from "../menu-belt-store";
import { renderBeltCard } from "./belt-card";

export interface StrengthMenu {
  id: string;
  name: string;
  menu: Menu;
}

export interface StrengthDeps {
  storage?: Storage;
  // Saved menus the household can use; each has its own belt and levels.
  menus?: StrengthMenu[];
  // The member's picked menu, shown first. Falls back to the first menu.
  selectedId?: string | null;
}

// Red → purple, 10 steps. Shared with the belt card's meter.
export const RAINBOW: string[] = [
  "#ff3b30", "#ff6b22", "#ff9f0a", "#ffd60a", "#34c759",
  "#30c0c6", "#32ade6", "#5b6cff", "#8e5bff", "#bf5af2",
];

export function renderStrengthScreen(root: HTMLElement, deps: StrengthDeps = {}): void {
  root.textContent = "";
  root.className = "screen strength";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "積み重ね";
  root.append(title);

  const menus = deps.menus ?? [];
  const empty = (text: string) => {
    const el = document.createElement("div");
    el.className = "strength-empty";
    el.dataset.strengthEmpty = "";
    el.textContent = text;
    root.append(el);
  };

  if (!menus.length) {
    empty("メニューを保存すると、帯と積み重ねがたまるよ");
    return;
  }

  const current = menus.find((m) => m.id === deps.selectedId) ?? menus[0];

  // Just for looking: picking here doesn't change the menu used for practice.
  if (menus.length > 1) {
    const select = document.createElement("select");
    select.className = "preset-select strength-menu-select";
    select.dataset.strengthMenu = "";
    menus.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === current.id) opt.selected = true;
      select.append(opt);
    });
    select.addEventListener("change", () => renderStrengthScreen(root, { ...deps, selectedId: select.value }));
    root.append(select);
  }

  const mb = loadMenuBelt(current.id, deps.storage);
  root.append(renderBeltCard(beltStateFor(mb, current.menu)));

  const names = drillNames(current.menu);
  if (!names.length) {
    empty("このメニューには種目がないよ");
    return;
  }

  const list = document.createElement("div");
  list.className = "strength-list";
  list.dataset.strengthList = "";

  names.forEach((name) => {
    const level = levelOf(mb, name);

    const row = document.createElement("div");
    row.className = "strength-row";
    row.dataset.strengthRow = name;

    const head = document.createElement("div");
    head.className = "strength-head";

    const nameEl = document.createElement("div");
    nameEl.className = "strength-name";
    nameEl.textContent = name;

    const levelEl = document.createElement("div");
    levelEl.className = "strength-level";
    levelEl.dataset.strengthLevel = name;
    levelEl.textContent = `Lv.${level}`;

    head.append(nameEl, levelEl);

    const bars = document.createElement("div");
    bars.className = "strength-bars";
    for (let i = 0; i < MAX_LEVEL; i++) {
      const bar = document.createElement("div");
      const lit = i < level;
      bar.className = `strength-bar${lit ? " lit" : ""}`;
      if (lit) bar.style.background = RAINBOW[i];
      bars.append(bar);
    }

    row.append(head, bars);
    list.append(row);
  });

  root.append(list);
}
