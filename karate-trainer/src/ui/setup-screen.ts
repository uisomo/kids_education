import type { Menu } from "../types";
import { totalSeconds, formatMMSS } from "../menu-store";

export interface SetupDeps {
  menu: Menu;
  onChange(menu: Menu): void;
  onStart(): void;
  onOpenVoice(): void;
}

let idc = 0;
const uid = () => `d${Date.now()}-${idc++}`;

export function renderSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  const menu = deps.menu;
  root.textContent = "";
  root.className = "screen setup";

  const rows = document.createElement("div");
  rows.dataset.rows = "";
  menu.forEach((drill, i) => {
    const row = document.createElement("div");
    row.dataset.row = "";
    row.className = "row" + (drill.kind === "rest" ? " rest" : "");

    const name = document.createElement("input");
    name.value = drill.name;
    name.className = "drill-name";
    name.addEventListener("input", () => {
      const next = menu.map((d, j) => j === i ? { ...d, name: name.value } : d);
      deps.onChange(next);
    });

    const secs = document.createElement("input");
    secs.type = "number"; secs.min = "1"; secs.value = String(drill.seconds);
    secs.className = "drill-secs";
    secs.addEventListener("input", () => {
      const n = Math.max(1, Number(secs.value) || 1);
      deps.onChange(menu.map((d, j) => j === i ? { ...d, seconds: n } : d));
    });

    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "row-del";
    del.addEventListener("click", () => deps.onChange(menu.filter((_, j) => j !== i)));

    row.append(name, secs, del);
    rows.append(row);
  });

  const add = document.createElement("button");
  add.dataset.add = ""; add.className = "add"; add.textContent = "＋ ドリルを追加";
  add.addEventListener("click", () =>
    deps.onChange([...menu, { id: uid(), name: "新しい種目", seconds: 30, kind: "drill" }]));

  const total = document.createElement("div");
  total.className = "total";
  total.textContent = `合計 ${menu.length} 種目 · ${formatMMSS(totalSeconds(menu))}`;

  const voice = document.createElement("button");
  voice.dataset.voice = ""; voice.className = "btn-ghost"; voice.textContent = "声を録音";
  voice.addEventListener("click", () => deps.onOpenVoice());

  const start = document.createElement("button");
  start.dataset.start = ""; start.className = "btn-start"; start.textContent = "稽古 開始 ▶";
  start.addEventListener("click", () => deps.onStart());

  root.append(rows, add, total, voice, start);
}
