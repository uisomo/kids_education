import type { Menu } from "../types";
import { totalSeconds, formatMMSS, MAX_RECORD_SECONDS } from "../menu-store";
import type { Preset } from "../preset-store";
import type { CharacterId, CharacterState } from "../character-store";
import type { BeltState } from "../belt-store";
import { renderBeltCard } from "./belt-card";
import { attachDragReorder, reorder } from "./drag-reorder";
import { openKufuModal } from "./kufu-modal";
import { COPY } from "../flavor";

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
  onSavePreset(): void;      // 「保存」: name + snapshot the current menu as a new saved menu
  // 「＋ 新しいメニューを作る」 picked: stop using the saved menu (rows are kept
  // as a starting point) so 「保存」 creates a new one.
  onNewMenu?(): void;
  onLoadPreset(id: string): void;   // pick a preset from the dropdown → load it now
  onDeletePreset(id: string): void; // remove a preset
  // Overwrite the selected preset with the current menu (上書き保存).
  onOverwritePreset?(id: string): void;
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
  // Shown instead of the belt card when `belt` is absent (no saved menu picked).
  beltHint?: string;
  // E3: the active member's assigned くらす name (read-only label), or null.
  className?: string | null;
  // E4: the parent's 感想コメント for the active member, shown as a banner just
  // above the start button, signed with kansouBy. Empty / absent → no banner.
  kansou?: string;
  kansouBy?: string;
  // 🔥 days in a row the member has practiced; shown top-right when > 0.
  streakDays?: number;
  // Member band: every registered kid, so whoever is about to practice can pick
  // themselves. Ungated on purpose — the 家族 tab still gates add/remove/plans.
  members?: SetupMember[];
  activeMemberId?: string;
  onSelectMember?(id: string): void;
  // 工夫 written by the kids themselves, from the 💡 button on each row: the
  // card lists the 種目's 工夫 (kufuFor, newest first) with 「けす」 on each and
  // adds one more while canAddKufuFor allows. kufuEnabled false hides the 💡.
  kufuEnabled?: boolean;
  kufuPerDrill?: number;
  kufuFor?(drillName: string): string[];
  canAddKufuFor?(drillName: string): boolean;
  onAddKufu?(drillName: string, text: string): void;
  onRemoveKufu?(drillName: string, index: number): void;
  // The card closed after an add / erase (caller re-renders every row's 💡).
  onKufuChanged?(): void;
  // Erase a 種目's 工夫 when its last row is deleted, and carry them across a
  // rename, so they don't keep counting toward the plan's cap.
  onDeleteKufu?(drillName: string): void;
  onRenameKufu?(from: string, to: string): void;
  // Practice BGM on/off, shown next to the drill total. Omit bgmMuted/onToggleBgm
  // together to hide the button (e.g. no bgm player configured).
  bgmMuted?: boolean;
  onToggleBgm?(): void;
}

const NEW_DRILL_NAME = "新しい種目";
const MAX_SECONDS = 3600;
const REST_NAME = "休憩";

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
  title.textContent = `今日の${COPY.practice}`;

  header.append(title);
  if (deps.streakDays && deps.streakDays > 0) {
    const streak = document.createElement("div");
    streak.className = "setup-streak";
    streak.dataset.streak = "";
    streak.textContent = `🔥 ${deps.streakDays}日継続中`;
    header.append(streak);
  }

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
  let beltCard: HTMLElement;
  if (!deps.belt && deps.beltHint) {
    beltCard = document.createElement("div");
    beltCard.className = "setup-belt-hint";
    beltCard.dataset.beltHint = "";
    beltCard.textContent = deps.beltHint;
  } else {
    beltCard = renderBeltCard(deps.belt ?? { index: 0, bars: 0 });
  }

  // --- Assigned くらす label (E3, read-only) ---
  let classLabel: HTMLDivElement | null = null;
  if (deps.className) {
    classLabel = document.createElement("div");
    classLabel.className = "setup-class-label";
    classLabel.dataset.classLabel = "";
    classLabel.textContent = `メニュー: ${deps.className}`;
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
  placeholder.textContent = "＋ 新しいメニューを作る";
  placeholder.dataset.presetNew = "";
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
    else deps.onNewMenu?.();
  });
  // The ✕ sits inside the dropdown's own box, at its right edge 「強くなるため ✕」,
  // so the wrapper is what the band lays out.
  const selectWrap = document.createElement("div");
  selectWrap.className = "preset-select-wrap";
  selectWrap.append(presetSelect);
  presetBand.append(selectWrap);

  const selectedPreset = deps.presets.find((p) => p.id === selectedId);
  // Built-in 基本 can't be overwritten or deleted; 「保存」 saves a copy instead.
  const editable = selectedPreset && !selectedPreset.builtIn ? selectedPreset : undefined;
  if (editable && deps.onOverwritePreset) {
    const overwrite = document.createElement("button");
    overwrite.className = "preset-save";
    overwrite.dataset.presetOverwrite = editable.id;
    overwrite.textContent = "上書き保存";
    overwrite.setAttribute("aria-label", `${editable.name} に上書き保存`);
    overwrite.addEventListener("click", () => deps.onOverwritePreset!(editable.id));
    presetBand.append(overwrite);
  }
  // Fewer buttons: a saved menu offers 「上書き保存」, everything else one
  // button — 「作る」 while writing a new menu, 「保存」 for a copy of 基本.
  if (!editable) {
    const savePreset = document.createElement("button");
    savePreset.className = "preset-save";
    savePreset.dataset.presetSave = "";
    savePreset.textContent = selectedId ? "保存" : "作る";
    savePreset.addEventListener("click", () => deps.onSavePreset());
    presetBand.append(savePreset);
  }

  // Deleting is an ✕ at the right edge of the dropdown itself rather than a
  // wide 「メニュー削除」 button under it — it belongs to the menu on show.
  if (editable) {
    const del = document.createElement("button");
    del.className = "preset-del";
    del.dataset.presetDel = editable.id;
    del.textContent = "✕";
    del.title = `${editable.name} を削除`;
    del.setAttribute("aria-label", `${editable.name} を削除`);
    del.addEventListener("click", () => {
      if (confirmDelete(editable.name)) deps.onDeletePreset(editable.id);
    });
    presetSelect.classList.add("has-del");
    selectWrap.append(del);
  }

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
    // Once the rename is committed (blur / return), the 工夫 follows the new
    // name — unless another row still uses the old one.
    let committedName = drill.name;
    name.addEventListener("change", () => {
      const from = committedName;
      committedName = name.value;
      if (menu.some((d, j) => j !== i && d.name === from)) return;
      deps.onRenameKufu?.(from, name.value);
    });

    const secs = document.createElement("input");
    secs.type = "number"; secs.min = "1"; secs.max = String(MAX_SECONDS); secs.step = "1";
    secs.inputMode = "numeric"; secs.value = String(drill.seconds);
    secs.className = "drill-secs";
    secs.addEventListener("input", () => {
      // Whole seconds, 1 s … 60 min (decimals showed as "0:1.5").
      const n = Math.min(MAX_SECONDS, Math.max(1, Math.round(Number(secs.value)) || 1));
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

    // 🥋 drill ⇄ ☕ 休憩. A 休憩 gets no cheers, no 工夫 and no 強さ, and
    // skipping one doesn't cost the belt bar. The default names follow the
    // kind so a fresh row reads right; any name the kid typed is kept.
    const isRest = drill.kind === "rest";
    const kind = document.createElement("button");
    kind.type = "button";
    kind.className = "row-kind" + (isRest ? " is-rest" : "");
    kind.dataset.kindToggle = drill.kind;
    kind.textContent = isRest ? "☕休憩" : COPY.drillIcon;
    kind.setAttribute("aria-label", isRest ? `${drill.name}: 休憩（タップで種目にする）` : `${drill.name}: 種目（タップで休憩にする）`);
    kind.title = isRest ? "休憩" : "種目";
    kind.addEventListener("click", () => {
      const cur = menu[i];
      const toRest = cur.kind !== "rest";
      const renamed = toRest
        ? (cur.name === NEW_DRILL_NAME ? REST_NAME : cur.name)
        : (cur.name === REST_NAME ? NEW_DRILL_NAME : cur.name);
      deps.onChange(menu.map((d, j) => (j === i ? { ...cur, kind: toRest ? "rest" : "drill", name: renamed } : d)));
    });

    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "row-del";
    del.addEventListener("click", () => {
      const gone = menu[i].name;
      if (!confirmDelete(gone)) return;
      // The last row with this name takes its 工夫 with it, freeing the slot.
      if (!menu.some((d, j) => j !== i && d.name === gone)) deps.onDeleteKufu?.(gone);
      deps.onChange(menu.filter((_, j) => j !== i));
    });

    row.append(drag, kind, name, secs);

    // 💡 工夫: the child's ideas for this 種目, in a centred card. Never
    // disabled — a full 種目 still opens so a 工夫 can be erased.
    if (!isRest && deps.kufuEnabled !== false && deps.kufuFor) {
      const kufu = document.createElement("button");
      kufu.className = "row-kufu";
      kufu.dataset.kufuOpen = drill.name;
      kufu.textContent = "💡";
      kufu.setAttribute("aria-label", `${drill.name} の工夫`);
      // Read the CURRENT name: the kid may have renamed the drill since render.
      const paint = () => {
        const notes = deps.kufuFor!(menu[i].name);
        kufu.classList.toggle("is-lit", notes.length > 0);
        kufu.title = notes[0] ?? "工夫をかく";
      };
      paint();
      kufu.addEventListener("click", () => {
        const drillName = menu[i].name;
        openKufuModal(root, {
          drillName,
          perDrill: deps.kufuPerDrill,
          notes: () => deps.kufuFor!(drillName),
          canAdd: () => deps.canAddKufuFor?.(drillName) ?? true,
          onAdd: (text) => deps.onAddKufu?.(drillName, text),
          onRemove: (index) => deps.onRemoveKufu?.(drillName, index),
          onClose: (changed) => {
            paint();
            if (changed) deps.onKufuChanged?.();
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
    deps.onChange([...menu, { id: uid(), name: NEW_DRILL_NAME, seconds: 30, kind: "drill" }]));

  const totalRow = document.createElement("div");
  totalRow.className = "total";

  const total = document.createElement("span");
  const start = document.createElement("button");
  start.dataset.start = ""; start.className = "btn-start";
  start.addEventListener("click", () => deps.onStart());
  // The total and the start button follow every seconds edit (no re-render
  // while typing). An empty menu would only open the camera; past the limit
  // the video gets too big to save and share.
  function updateTotal(): void {
    const secs = totalSeconds(menu);
    const over = secs > MAX_RECORD_SECONDS;
    const limit = `${MAX_RECORD_SECONDS / 60}分`;
    total.textContent = `合計 ${menu.length} 種目 · ${formatMMSS(secs)}${over ? `（${limit}まで）` : ""}`;
    total.classList.toggle("is-over", over);
    start.disabled = menu.length === 0 || over;
    start.textContent = menu.length === 0 ? "種目を追加してね" : over ? `${limit}までにしてね` : `${COPY.practice} 開始 ▶`;
  }
  updateTotal();
  totalRow.append(total);

  // 稽古 開始 and the BGM switch travel together: the sticky row is the last
  // thing anyone touches before practice, so BGM is decided there rather than
  // up next to the drill total.
  const startRow = document.createElement("div");
  startRow.className = "start-row";
  startRow.dataset.startRow = "";
  startRow.append(start);

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
    startRow.append(bgmBtn);
  }


  root.append(header);
  if (memberBand) root.append(memberBand);
  root.append(beltCard);
  if (classLabel) root.append(classLabel);
  root.append(presetBand, rows, add, totalRow);

  // --- 感想コメント banner (E4, parent message) right above the start button,
  // where the kid looks just before practice ---
  const kansou = deps.kansou?.trim();
  if (kansou) {
    const banner = document.createElement("div");
    banner.className = "setup-kansou-banner";
    banner.dataset.kansouBanner = "";
    const text = document.createElement("div");
    text.textContent = `✉️ ${kansou}`;
    banner.append(text);
    const by = deps.kansouBy?.trim();
    if (by) {
      const sign = document.createElement("div");
      sign.className = "setup-kansou-by";
      sign.dataset.kansouBy = "";
      sign.textContent = `by ${by}`;
      banner.append(sign);
    }
    root.append(banner);
  }
  root.append(startRow);
}
