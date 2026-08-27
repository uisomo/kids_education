import type { Menu } from "../types";
import { totalSeconds, formatMMSS } from "../menu-store";
import type { Preset } from "../preset-store";

export interface SetupDeps {
  menu: Menu;
  // Structural change (add / delete / reorder): caller re-renders the screen.
  onChange(menu: Menu): void;
  // In-place field edit (name / seconds): caller persists only, NO re-render —
  // re-rendering on every keystroke destroys the focused <input> and cancels
  // the iOS IME composition (かな入力 drops out after one character).
  onEdit(menu: Menu): void;
  onStart(): void;
  onOpenVoice(): void;
  // Saved named menus (presets) shown in the top band.
  presets: Preset[];
  onSavePreset(): void;      // "＋ 保存": name + snapshot the current menu
  onLoadPreset(id: string): void;   // tap a preset chip → load it now
  onDeletePreset(id: string): void; // remove a preset
}

let idc = 0;
const uid = () => `d${Date.now()}-${idc++}`;

export function renderSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  const menu = deps.menu;
  root.textContent = "";
  root.className = "screen setup";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "今日の稽古";

  // --- Preset band: saved named menus + "save current" ---
  const presetBand = document.createElement("div");
  presetBand.className = "preset-band";
  presetBand.dataset.presetBand = "";
  deps.presets.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "preset-chip";
    chip.dataset.preset = p.id;

    const load = document.createElement("button");
    load.className = "preset-load";
    load.dataset.presetLoad = p.id;
    load.textContent = p.name;
    load.addEventListener("click", () => deps.onLoadPreset(p.id));

    const del = document.createElement("button");
    del.className = "preset-del";
    del.dataset.presetDel = p.id;
    del.textContent = "✕";
    del.setAttribute("aria-label", `${p.name} を削除`);
    del.addEventListener("click", () => deps.onDeletePreset(p.id));

    chip.append(load, del);
    presetBand.append(chip);
  });
  const savePreset = document.createElement("button");
  savePreset.className = "preset-save";
  savePreset.dataset.presetSave = "";
  savePreset.textContent = "＋ 保存";
  savePreset.addEventListener("click", () => deps.onSavePreset());
  presetBand.append(savePreset);

  const rows = document.createElement("div");
  rows.dataset.rows = "";
  menu.forEach((drill, i) => {
    const row = document.createElement("div");
    row.dataset.row = "";
    row.className = "row" + (drill.kind === "rest" ? " rest" : "");

    const name = document.createElement("input");
    name.value = drill.name;
    name.className = "drill-name";
    // Edit in place + persist only (no re-render) so focus / IME survive typing.
    name.addEventListener("input", () => {
      menu[i] = { ...menu[i], name: name.value };
      deps.onEdit(menu);
    });

    const secs = document.createElement("input");
    secs.type = "number"; secs.min = "1"; secs.value = String(drill.seconds);
    secs.className = "drill-secs";
    secs.addEventListener("input", () => {
      const n = Math.max(1, Number(secs.value) || 1);
      menu[i] = { ...menu[i], seconds: n };
      deps.onEdit(menu);
      updateTotal();
    });

    const up = document.createElement("button");
    up.textContent = "↑"; up.className = "row-move"; up.dataset.up = "";
    if (i === 0) {
      up.disabled = true;
    } else {
      up.addEventListener("click", () => {
        const next = menu.slice();
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        deps.onChange(next);
      });
    }

    const down = document.createElement("button");
    down.textContent = "↓"; down.className = "row-move"; down.dataset.down = "";
    if (i === menu.length - 1) {
      down.disabled = true;
    } else {
      down.addEventListener("click", () => {
        const next = menu.slice();
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        deps.onChange(next);
      });
    }

    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "row-del";
    del.addEventListener("click", () => deps.onChange(menu.filter((_, j) => j !== i)));

    row.append(name, secs, up, down, del);
    rows.append(row);
  });

  const add = document.createElement("button");
  add.dataset.add = ""; add.className = "add"; add.textContent = "＋ ドリルを追加";
  add.addEventListener("click", () =>
    deps.onChange([...menu, { id: uid(), name: "新しい種目", seconds: 30, kind: "drill" }]));

  const total = document.createElement("div");
  total.className = "total";
  function updateTotal(): void {
    total.textContent = `合計 ${menu.length} 種目 · ${formatMMSS(totalSeconds(menu))}`;
  }
  updateTotal();

  const voice = document.createElement("button");
  voice.dataset.voice = ""; voice.className = "btn-ghost"; voice.textContent = "声を録音";
  voice.addEventListener("click", () => deps.onOpenVoice());

  const start = document.createElement("button");
  start.dataset.start = ""; start.className = "btn-start"; start.textContent = "稽古 開始 ▶";
  start.addEventListener("click", () => deps.onStart());

  root.append(title, presetBand, rows, add, total, voice, start);
}
