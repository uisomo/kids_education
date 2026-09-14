import type { Menu } from "../types";
import { totalSeconds, formatMMSS } from "../menu-store";
import type { Preset } from "../preset-store";
import type { CharacterId, CharacterState } from "../character-store";
import type { BeltState } from "../belt-store";
import { renderBeltCard } from "./belt-card";
import { attachDragReorder, reorder } from "./drag-reorder";
import { openKufuModal } from "./kufu-modal";

export interface SetupMember {
  id: string;
  name: string;
}

export interface SetupDeps {
  menu: Menu;
  // Structural change (add / delete / reorder): caller re-renders the screen.
  onChange(menu: Menu): void;
  // In-place field edit (name / seconds): caller persists only, NO re-render —
  // re-rendering on every keystroke destroys the focused <input> and cancels
  // the iOS IME composition (かな入力 drops out after one character).
  onEdit(menu: Menu): void;
  onStart(): void;
  // Voice recording entry & partner selection were removed from this screen.
  // Props kept optional so existing callers/tests stay compatible.
  onOpenVoice?(): void;
  // Saved named menus (presets), shown as a closed-by-default dropdown.
  presets: Preset[];
  onSavePreset(): void;      // "＋ 保存": name + snapshot the current menu
  onLoadPreset(id: string): void;   // pick a preset from the dropdown → load it now
  onDeletePreset(id: string): void; // remove a preset
  // Preset currently reflected in the dropdown (drives which delete button shows).
  selectedPresetId?: string;
  // Confirmation gate shared by preset delete and drill-row delete.
  // Defaults to window.confirm. Return true to proceed with the delete.
  confirmDelete?(label: string): boolean;
  // Companion (cheer character) selection.
  characterId?: CharacterId;
  onSelectCharacter?(id: CharacterId): void;
  characterState?: CharacterState;
  // The active member's belt and bars (drives the belt card). Absent → 白帯, 0 bars.
  belt?: BeltState;
  // E3: the active member's assigned くらす name (read-only label), or null.
  className?: string | null;
  // E4: the parent's 感想コメント for the active member, shown as a banner at the
  // very top of the screen. Empty / absent → no banner.
  kansou?: string;
  // Member band: every registered kid, so whoever is about to practice can pick
  // themselves. Ungated on purpose — the 家族 tab still gates add/remove/plans.
  members?: SetupMember[];
  activeMemberId?: string;
  onSelectMember?(id: string): void;
  // 工夫 written by the kids themselves, from the 💡 button on each row.
  // kufuEnabled false (工夫 cap 0) hides the buttons entirely; when enabled
  // but canAddKufuFor(drillName) is false (Free plan's single slot already
  // used by another 種目), the button for THIS 種目 is shown but disabled.
  kufuEnabled?: boolean;
  latestKufuFor?(drillName: string): string;
  canAddKufuFor?(drillName: string): boolean;
  onSaveKufu?(drillName: string, text: string): void;
  // Practice BGM on/off, shown next to the drill total. Omit bgmMuted/onToggleBgm
  // together to hide the button (e.g. no bgm player configured).
  bgmMuted?: boolean;
  onToggleBgm?(): void;
}

let idc = 0;
const uid = () => `d${Date.now()}-${idc++}`;

export function renderSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  const menu = deps.menu;
  const confirmDelete = deps.confirmDelete
    ?? ((label: string) => (typeof window !== "undefined" ? window.confirm(`「${label}」を削除しますか？`) : true));
  root.textContent = "";
  root.className = "screen setup";

  // --- Screen title (top image / logo badge removed) ---
  const header = document.createElement("div");
  header.className = "toybox-header";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "今日の稽古";

  header.append(title);

  // --- Member band: who is practicing right now (tap to switch, no gate) ---
  let memberBand: HTMLDivElement | null = null;
  if (deps.members?.length) {
    memberBand = document.createElement("div");
    memberBand.className = "member-band";
    memberBand.dataset.memberBand = "";
    deps.members.forEach((m) => {
      const chip = document.createElement("button");
      chip.className = "member-chip" + (m.id === deps.activeMemberId ? " is-active" : "");
      chip.dataset.member = m.id;
      chip.textContent = m.name;
      if (m.id === deps.activeMemberId) {
        chip.setAttribute("aria-current", "true");
      } else {
        chip.addEventListener("click", () => deps.onSelectMember?.(m.id));
      }
      memberBand!.append(chip);
    });
  }

  // --- Belt card: drawn obi + 10-bar meter toward the next belt ---
  const beltCard = renderBeltCard(deps.belt ?? { index: 0, bars: 0 });

  // --- Assigned くらす label (E3, read-only) ---
  let classLabel: HTMLDivElement | null = null;
  if (deps.className) {
    classLabel = document.createElement("div");
    classLabel.className = "setup-class-label";
    classLabel.dataset.classLabel = "";
    classLabel.textContent = `くらす: ${deps.className}`;
  }

  // --- Preset dropdown: saved named menus, closed by default + "save current" ---
  const presetBand = document.createElement("div");
  presetBand.className = "preset-band";
  presetBand.dataset.presetBand = "";

  const presetSelect = document.createElement("select");
  presetSelect.className = "preset-select";
  presetSelect.dataset.presetSelect = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "メニューを選ぶ…";
  presetSelect.append(placeholder);

  const selectedId = deps.selectedPresetId ?? "";
  deps.presets.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    presetSelect.append(opt);
  });
  if (!selectedId) placeholder.selected = true;

  presetSelect.addEventListener("change", () => {
    if (presetSelect.value) deps.onLoadPreset(presetSelect.value);
  });
  presetBand.append(presetSelect);

  const selectedPreset = deps.presets.find((p) => p.id === selectedId);
  if (selectedPreset) {
    const del = document.createElement("button");
    del.className = "preset-del";
    del.dataset.presetDel = selectedPreset.id;
    del.textContent = "✕ このメニューを削除";
    del.setAttribute("aria-label", `${selectedPreset.name} を削除`);
    del.addEventListener("click", () => {
      if (confirmDelete(selectedPreset.name)) deps.onDeletePreset(selectedPreset.id);
    });
    presetBand.append(del);
  }

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

    // Drag handle — grabbing anywhere else would fight the name input.
    // Reordering itself is wired once, on the rows container, below.
    const drag = document.createElement("button");
    drag.textContent = "≡"; drag.className = "row-drag"; drag.dataset.drag = "";
    drag.type = "button";
    drag.setAttribute("aria-label", `${drill.name} を並べ替え`);

    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "row-del";
    del.addEventListener("click", () => {
      if (confirmDelete(menu[i].name)) deps.onChange(menu.filter((_, j) => j !== i));
    });

    row.append(drag, name, secs);

    // 💡 工夫: the child writes their own idea for this 種目 in a centred card.
    if (deps.kufuEnabled !== false && deps.latestKufuFor) {
      const kufu = document.createElement("button");
      kufu.className = "row-kufu";
      kufu.dataset.kufuOpen = drill.name;
      kufu.textContent = "💡";
      const canAdd = deps.canAddKufuFor?.(drill.name) ?? true;
      kufu.disabled = !canAdd;
      if (!canAdd) kufu.title = "ほかの種目の工夫がいっぱいです";
      const paint = (note: string) => {
        kufu.classList.toggle("is-lit", !!note);
        if (canAdd) kufu.title = note || "工夫をかく";
        kufu.setAttribute("aria-label", `${drill.name} の工夫`);
      };
      paint(deps.latestKufuFor(drill.name));
      kufu.addEventListener("click", () => {
        // Read the CURRENT name: the kid may have renamed the drill since render.
        const drillName = menu[i].name;
        openKufuModal(root, {
          drillName,
          current: deps.latestKufuFor!(drillName),
          onSave: (text) => {
            deps.onSaveKufu?.(drillName, text);
            paint(text);   // light the bulb in place — no re-render, no lost focus
          },
        });
      });
      row.append(kufu);
    }

    row.append(del);
    rows.append(row);
  });

  attachDragReorder(rows, {
    onReorder: (from, to) => deps.onChange(reorder(menu, from, to)),
  });

  const add = document.createElement("button");
  add.dataset.add = ""; add.className = "add"; add.textContent = "＋ ドリルを追加";
  add.addEventListener("click", () =>
    deps.onChange([...menu, { id: uid(), name: "新しい種目", seconds: 30, kind: "drill" }]));

  const totalRow = document.createElement("div");
  totalRow.className = "total";

  const total = document.createElement("span");
  function updateTotal(): void {
    total.textContent = `合計 ${menu.length} 種目 · ${formatMMSS(totalSeconds(menu))}`;
  }
  updateTotal();
  totalRow.append(total);

  if (deps.onToggleBgm) {
    const BGM_ON_LABEL = "🎵 BGM";
    const BGM_OFF_LABEL = "🔇 BGM";
    const bgmBtn = document.createElement("button");
    bgmBtn.type = "button";
    bgmBtn.dataset.bgmToggle = "";
    bgmBtn.className = "bgm-toggle-btn" + (deps.bgmMuted ? " muted" : "");
    bgmBtn.textContent = deps.bgmMuted ? BGM_OFF_LABEL : BGM_ON_LABEL;
    bgmBtn.setAttribute("aria-label", "練習BGM on/off");
    bgmBtn.addEventListener("click", () => deps.onToggleBgm!());
    totalRow.append(bgmBtn);
  }

  const start = document.createElement("button");
  start.dataset.start = ""; start.className = "btn-start"; start.textContent = "稽古 開始 ▶";
  start.addEventListener("click", () => deps.onStart());

  // --- 感想コメント banner (E4, parent message) at the very top ---
  const kansou = deps.kansou?.trim();
  if (kansou) {
    const banner = document.createElement("div");
    banner.className = "setup-kansou-banner";
    banner.dataset.kansouBanner = "";
    banner.textContent = `💛 ${kansou}`;
    root.append(banner);
  }

  root.append(header);
  if (memberBand) root.append(memberBand);
  root.append(beltCard);
  if (classLabel) root.append(classLabel);
  root.append(presetBand, rows, add, totalRow, start);
}
