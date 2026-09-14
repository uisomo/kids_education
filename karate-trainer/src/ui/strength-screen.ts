// 強さ screen: per-drill level with a rainbow 10-bar meter. Bars go red→purple
// left→right; the first `inLevel` bars are lit (this level's progress), the rest
// dimmed. Level = floor(count / 10); count keeps growing across levels.

import { loadCounts, levelFor, PER_LEVEL } from "../progress-store";

export interface StrengthDeps {
  storage?: Storage;
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
  title.textContent = "強さ";

  const counts = loadCounts(deps.storage);
  const drills = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);   // most-practiced first

  root.append(title);

  if (!drills.length) {
    const empty = document.createElement("div");
    empty.className = "strength-empty";
    empty.dataset.strengthEmpty = "";
    empty.textContent = "まだ稽古がないよ。特訓してみよう！";
    root.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "strength-list";
  list.dataset.strengthList = "";

  drills.forEach(([name, count]) => {
    const info = levelFor(count);

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
    levelEl.textContent = `Lv.${info.level}`;

    head.append(nameEl, levelEl);

    const bars = document.createElement("div");
    bars.className = "strength-bars";
    for (let i = 0; i < PER_LEVEL; i++) {
      const bar = document.createElement("div");
      const lit = i < info.inLevel;
      bar.className = `strength-bar${lit ? " lit" : ""}`;
      if (lit) bar.style.background = RAINBOW[i];
      bars.append(bar);
    }

    const countEl = document.createElement("div");
    countEl.className = "strength-count";
    countEl.textContent = `つうさん ${count} かい`;

    row.append(head, bars, countEl);
    list.append(row);
  });

  root.append(list);
}
