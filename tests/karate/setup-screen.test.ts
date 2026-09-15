// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

function deps(over: Record<string, unknown> = {}) {
  return {
    menu: structuredClone(DEFAULT_MENU),
    onChange: vi.fn(),
    onEdit: vi.fn(),
    onStart: vi.fn(),
    onOpenVoice: vi.fn(),
    presets: [],
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    ...over,
  };
}

it("renders a row per drill and fires onStart", () => {
  const root = document.createElement("div");
  const onStart = vi.fn();
  renderSetupScreen(root, deps({ onStart }));
  expect(root.querySelectorAll("[data-row]")).toHaveLength(DEFAULT_MENU.length);
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  expect(onStart).toHaveBeenCalledOnce();
});

it("adding a drill fires onChange with a longer menu", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, deps({ onChange }));
  root.querySelector<HTMLButtonElement>("[data-add]")!.click();
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls[0][0].length).toBe(DEFAULT_MENU.length + 1);
});

it("deleting a drill row asks for confirmation and fires onChange only when confirmed", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(true);
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange, confirmDelete }));
  root.querySelector<HTMLButtonElement>(".row-del")!.click();
  expect(confirmDelete).toHaveBeenCalledWith(menu[0].name);
  expect(onChange).toHaveBeenCalledWith(menu.slice(1));
});

it("deleting a drill row does nothing when the user cancels the confirmation", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(false);
  renderSetupScreen(root, deps({ onChange, confirmDelete }));
  root.querySelector<HTMLButtonElement>(".row-del")!.click();
  expect(onChange).not.toHaveBeenCalled();
});

// --- Reorder: drag handles replaced the ↑/↓ buttons ---
// The pointer gesture needs real layout, so it is covered by drag-reorder's own
// unit tests; here we drive the keyboard fallback the same handle exposes.
function pressKey(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

it("renders a drag handle per row and no ↑/↓ buttons", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelectorAll("[data-drag]")).toHaveLength(DEFAULT_MENU.length);
  expect(root.querySelector("[data-up]")).toBeNull();
  expect(root.querySelector("[data-down]")).toBeNull();
});

it("ArrowDown on the first row's drag handle swaps the first two drills", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange }));
  pressKey(root.querySelectorAll<HTMLElement>("[data-drag]")[0], "ArrowDown");
  expect(onChange).toHaveBeenCalled();
  const result = onChange.mock.calls[0][0];
  expect(result[0].name).toBe(menu[1].name); // second becomes first
  expect(result[1].name).toBe(menu[0].name); // first becomes second
});

it("ArrowUp on the first row's drag handle does nothing (no-op)", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  renderSetupScreen(root, deps({ onChange }));
  pressKey(root.querySelectorAll<HTMLElement>("[data-drag]")[0], "ArrowUp");
  expect(onChange).not.toHaveBeenCalled();
});

// Regression: typing a drill name must NOT re-render the screen (which would
// destroy the focused input and cancel the iOS IME composition). It should
// persist via onEdit and keep the SAME input element focused.
it("editing a name calls onEdit (not onChange) and preserves the input element + focus", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const onChange = vi.fn();
  const onEdit = vi.fn();
  renderSetupScreen(root, deps({ onChange, onEdit }));

  const firstInput = root.querySelector<HTMLInputElement>(".drill-name")!;
  firstInput.focus();
  firstInput.value = "前蹴りみ";
  firstInput.dispatchEvent(new Event("input", { bubbles: true }));

  // structural re-render must NOT happen
  expect(onChange).not.toHaveBeenCalled();
  // edit is persisted
  expect(onEdit).toHaveBeenCalledOnce();
  expect(onEdit.mock.calls[0][0][0].name).toBe("前蹴りみ");
  // the very same input node is still in the DOM and still focused
  expect(root.querySelector(".drill-name")).toBe(firstInput);
  expect(document.activeElement).toBe(firstInput);

  root.remove();
});

// Editing seconds also persists via onEdit and updates the total live without
// a re-render.
it("editing seconds calls onEdit and updates the total in place", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const onEdit = vi.fn();
  const menu = structuredClone(DEFAULT_MENU);
  renderSetupScreen(root, deps({ menu, onChange, onEdit }));

  const secsInput = root.querySelector<HTMLInputElement>(".drill-secs")!;
  secsInput.value = "40";
  secsInput.dispatchEvent(new Event("input", { bubbles: true }));

  expect(onChange).not.toHaveBeenCalled();
  expect(onEdit).toHaveBeenCalled();
  expect(onEdit.mock.calls[0][0][0].seconds).toBe(40);
  // total reflects the new value without a full re-render
  expect(root.querySelector(".total")!.textContent).toContain("種目");
});

// --- Preset dropdown ---
it("renders a closed-by-default dropdown with one option per preset", () => {
  const root = document.createElement("div");
  const presets = [
    { id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) },
    { id: "p2", name: "型の日", menu: structuredClone(DEFAULT_MENU) },
  ];
  renderSetupScreen(root, deps({ presets }));
  const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
  expect(select).not.toBeNull();
  // "未選択" placeholder + one <option> per preset, nothing pre-selected
  expect(select.querySelectorAll("option")).toHaveLength(presets.length + 1);
  expect(select.value).toBe("");
  // no delete button until a preset is actually selected
  expect(root.querySelector("[data-preset-del]")).toBeNull();
});

it("selecting a preset in the dropdown fires onLoadPreset and reveals its delete button", () => {
  const root = document.createElement("div");
  const onLoadPreset = vi.fn();
  const presets = [
    { id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) },
    { id: "p2", name: "型の日", menu: structuredClone(DEFAULT_MENU) },
  ];
  renderSetupScreen(root, deps({ presets, onLoadPreset }));
  const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
  select.value = "p2";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(onLoadPreset).toHaveBeenCalledWith("p2");
});

it("a new menu offers only 保存; a saved menu offers only 上書き保存 and メニュー削除", () => {
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  const fresh = document.createElement("div");
  renderSetupScreen(fresh, deps({ presets, onOverwritePreset: vi.fn() }));
  expect(fresh.querySelector("[data-preset-select]")!.querySelector("option")!.textContent).toBe("＋ 新しいメニューを作る");
  expect(fresh.querySelector("[data-preset-save]")!.textContent).toBe("保存");
  expect(fresh.querySelector("[data-preset-overwrite]")).toBeNull();
  expect(fresh.querySelector("[data-preset-del]")).toBeNull();

  const picked = document.createElement("div");
  renderSetupScreen(picked, deps({ presets, selectedPresetId: "p1", onOverwritePreset: vi.fn() }));
  expect(picked.querySelector("[data-preset-save]")).toBeNull();
  expect(picked.querySelector("[data-preset-overwrite]")!.textContent).toBe("上書き保存");
  expect(picked.querySelector("[data-preset-del]")!.textContent).toBe("メニュー削除");
});

it("choosing ＋ 新しいメニューを作る fires onNewMenu", () => {
  const root = document.createElement("div");
  const onNewMenu = vi.fn();
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, selectedPresetId: "p1", onNewMenu }));
  const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
  select.value = "";
  select.dispatchEvent(new Event("change"));
  expect(onNewMenu).toHaveBeenCalledOnce();
});

it("save button fires onSavePreset", () => {
  const root = document.createElement("div");
  const onSavePreset = vi.fn();
  renderSetupScreen(root, deps({ onSavePreset }));
  root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  expect(onSavePreset).toHaveBeenCalledOnce();
});

it("preset delete button asks for confirmation and fires onDeletePreset only when confirmed", () => {
  const root = document.createElement("div");
  const onDeletePreset = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(true);
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, onDeletePreset, confirmDelete, selectedPresetId: "p1" }));
  root.querySelector<HTMLButtonElement>('[data-preset-del="p1"]')!.click();
  expect(confirmDelete).toHaveBeenCalledWith("基本稽古");
  expect(onDeletePreset).toHaveBeenCalledWith("p1");
});

it("preset delete does nothing when the user cancels the confirmation", () => {
  const root = document.createElement("div");
  const onDeletePreset = vi.fn();
  const confirmDelete = vi.fn().mockReturnValue(false);
  const presets = [{ id: "p1", name: "基本稽古", menu: structuredClone(DEFAULT_MENU) }];
  renderSetupScreen(root, deps({ presets, onDeletePreset, confirmDelete, selectedPresetId: "p1" }));
  root.querySelector<HTMLButtonElement>('[data-preset-del="p1"]')!.click();
  expect(onDeletePreset).not.toHaveBeenCalled();
});

// --- Removed UI: voice-record entry, partner carousel, top banner image ---
it("no longer renders the voice-record button, partner carousel, or top banner image", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-voice]")).toBeNull();
  expect(root.querySelector(".character-selector-grid")).toBeNull();
  expect(root.querySelector(".character-card-btn")).toBeNull();
  expect(root.querySelector(".toybox-banner-img")).toBeNull();
  // start button + belt card still present
  expect(root.querySelector("[data-start]")).not.toBeNull();
  expect(root.querySelector(".belt-status-card")).not.toBeNull();
});

// --- E3: assigned くらす label ---
it("shows the assigned class name when className is provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ className: "基礎" }));
  const label = root.querySelector<HTMLElement>("[data-class-label]");
  expect(label).not.toBeNull();
  expect(label!.textContent).toBe("メニュー: 基礎");
});

it("omits the class label when className is null/absent", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ className: null }));
  expect(root.querySelector("[data-class-label]")).toBeNull();
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-class-label]")).toBeNull();
});

// --- E4: 感想コメント banner (right above the start button) ---
it("shows the 感想 comment banner right above the start button when provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kansou: "いつも がんばってるね" }));
  const banner = root.querySelector<HTMLElement>("[data-kansou-banner]");
  expect(banner).not.toBeNull();
  expect(banner!.textContent).toBe("✉️ いつも がんばってるね");   // a letter, no 💛
  expect(banner!.nextElementSibling).toBe(root.querySelector("[data-start]"));
});

it("omits the 感想 banner when kansou is empty/absent", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kansou: "" }));
  expect(root.querySelector("[data-kansou-banner]")).toBeNull();
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-kansou-banner]")).toBeNull();
});

// --- Member band: kids pick who is practicing, no parental gate ---
const MEMBERS = [
  { id: "m1", name: "ゆうた" },
  { id: "m2", name: "さくら" },
];

it("renders a chip per registered member with the active one marked", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m2" }));
  const chips = root.querySelectorAll<HTMLElement>("[data-member]");
  expect(chips).toHaveLength(2);
  expect(chips[0].textContent).toContain("ゆうた");
  expect(chips[1].classList.contains("is-active")).toBe(true);
  expect(chips[0].classList.contains("is-active")).toBe(false);
});

it("tapping a member chip fires onSelectMember with that id", () => {
  const root = document.createElement("div");
  const onSelectMember = vi.fn();
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m1", onSelectMember }));
  root.querySelector<HTMLButtonElement>('[data-member="m2"]')!.click();
  expect(onSelectMember).toHaveBeenCalledWith("m2");
});

it("tapping the already-active member does not re-fire onSelectMember", () => {
  const root = document.createElement("div");
  const onSelectMember = vi.fn();
  renderSetupScreen(root, deps({ members: MEMBERS, activeMemberId: "m1", onSelectMember }));
  root.querySelector<HTMLButtonElement>('[data-member="m1"]')!.click();
  expect(onSelectMember).not.toHaveBeenCalled();
});

it("omits the member band when no members are provided", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-member-band]")).toBeNull();
});

// --- 帯 card ---
it("draws the member's belt with its bars and what comes next", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ belt: { index: 10, bars: 7 } }));
  const card = root.querySelector(".belt-status-card")!;
  expect(card.classList.contains("rpg")).toBe(true);
  expect(card.querySelector("[data-belt-name]")!.textContent).toBe("🔮 クリスタルの帯");
  expect(card.querySelectorAll(".belt-bar")).toHaveLength(10);
  expect(card.querySelectorAll(".belt-bar.lit")).toHaveLength(7);
  expect(card.querySelector("[data-belt-next]")!.textContent).toContain("💎 ダイヤモンドの帯");
  expect(card.querySelector("[data-belt-next]")!.textContent).toContain("Lv.10");
});

it("colored belts have no RPG frame, and the top belt says so", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps());
  const card = root.querySelector(".belt-status-card")!;
  expect(card.classList.contains("rpg")).toBe(false);
  expect(card.querySelector("[data-belt-name]")!.textContent).toBe("白帯");

  const top = document.createElement("div");
  renderSetupScreen(top, deps({ belt: { index: 13, bars: 10 } }));
  expect(top.querySelector("[data-belt-next]")!.textContent).toBe("さいこうの帯！");
});

// --- freeing a 工夫 slot from the setup screen ---
it("deleting the last row of a 種目 erases its 工夫; a duplicate row keeps it", () => {
  const root = document.createElement("div");
  const onDeleteKufu = vi.fn();
  const menu = [
    { id: "a", name: "前蹴り", seconds: 30, kind: "drill" as const },
    { id: "b", name: "前蹴り", seconds: 30, kind: "drill" as const },
    { id: "c", name: "突き", seconds: 30, kind: "drill" as const },
  ];
  renderSetupScreen(root, deps({ menu, confirmDelete: () => true, onDeleteKufu }));
  const dels = root.querySelectorAll<HTMLButtonElement>(".row-del");
  dels[0].click();
  expect(onDeleteKufu).not.toHaveBeenCalled();
  dels[2].click();
  expect(onDeleteKufu).toHaveBeenCalledWith("突き");
});

it("committing a rename carries the 工夫 to the new name", () => {
  const root = document.createElement("div");
  const onRenameKufu = vi.fn();
  const menu = [{ id: "a", name: "新しい種目", seconds: 30, kind: "drill" as const }];
  renderSetupScreen(root, deps({ menu, onRenameKufu }));
  const name = root.querySelector<HTMLInputElement>(".drill-name")!;
  name.value = "前蹴り";
  name.dispatchEvent(new Event("input"));
  name.dispatchEvent(new Event("change"));
  expect(onRenameKufu).toHaveBeenCalledWith("新しい種目", "前蹴り");
});

it("a 休憩 row's toggle reads ☕休憩 and keeps the name input", () => {
  const root = document.createElement("div");
  const menu = [{ id: "r", name: "水のむ", seconds: 30, kind: "rest" as const }];
  renderSetupScreen(root, deps({ menu }));
  expect(root.querySelector("[data-kind-toggle]")!.textContent).toBe("☕休憩");
  expect(root.querySelector<HTMLInputElement>(".drill-name")!.value).toBe("水のむ");
});

it("the 感想 banner is signed with who wrote it", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ kansou: "がんばったね", kansouBy: "おかあさん" }));
  expect(root.querySelector("[data-kansou-by]")!.textContent).toBe("by おかあさん");
});

it("without a saved menu the belt card becomes a hint", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ beltHint: "メニューを保存すると、帯と強さがたまるよ" }));
  expect(root.querySelector(".belt-status-card")).toBeNull();
  expect(root.querySelector("[data-belt-hint]")!.textContent).toContain("メニューを保存");
});

it("a menu over 10 minutes turns the total red and can't start; shortening it re-enables 開始", () => {
  const root = document.createElement("div");
  const menu = [{ id: "a", name: "型", seconds: 601, kind: "drill" as const }];
  renderSetupScreen(root, deps({ menu }));
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;
  expect(start.disabled).toBe(true);
  expect(start.textContent).toBe("10分までにしてね");
  expect(root.querySelector(".total .is-over")).not.toBeNull();

  const secs = root.querySelector<HTMLInputElement>(".drill-secs")!;
  secs.value = "600";
  secs.dispatchEvent(new Event("input"));
  expect(start.disabled).toBe(false);
  expect(start.textContent).toBe("稽古 開始 ▶");
  expect(root.querySelector(".total .is-over")).toBeNull();
});

// --- 💡 工夫 card per row ---
function kufuDeps(notes: Record<string, string[]>, over: Record<string, unknown> = {}) {
  const menu = [
    { id: "a", name: "前蹴り", seconds: 30, kind: "drill" as const },
    { id: "r", name: "休憩", seconds: 15, kind: "rest" as const },
    { id: "b", name: "回し蹴り", seconds: 30, kind: "drill" as const },
  ];
  const onAddKufu = vi.fn((name: string, text: string) => { notes[name] = [text, ...(notes[name] ?? [])]; });
  const onRemoveKufu = vi.fn((name: string, i: number) => { notes[name].splice(i, 1); });
  const onKufuChanged = vi.fn();
  return {
    ...deps({
      menu, kufuEnabled: true, kufuPerDrill: 3,
      kufuFor: (name: string) => notes[name] ?? [],
      canAddKufuFor: (name: string) => (notes[name]?.length ?? 0) < 3,
      ...over,
    }),
    onAddKufu, onRemoveKufu, onKufuChanged,
  };
}

it("renders a 💡 per drill row (none on 休憩), lit only when the 種目 has a 工夫", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, kufuDeps({ 前蹴り: ["こしをまわす"] }));
  const bulbs = root.querySelectorAll<HTMLButtonElement>("[data-kufu-open]");
  expect(bulbs).toHaveLength(2);
  expect(bulbs[0].classList.contains("is-lit")).toBe(true);
  expect(bulbs[1].classList.contains("is-lit")).toBe(false);
});

it("omits the 💡 when kufuEnabled is false", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, kufuDeps({}, { kufuEnabled: false }));
  expect(root.querySelector("[data-kufu-open]")).toBeNull();
});

it("adding a 工夫 keeps the card open; とじる lights the 💡 and asks for a re-render", () => {
  const root = document.createElement("div");
  const d = kufuDeps({});
  renderSetupScreen(root, d);
  const bulb = root.querySelectorAll<HTMLButtonElement>("[data-kufu-open]")[1];
  bulb.click();
  expect(root.querySelector("[data-kufu-modal]")!.textContent).toContain("回し蹴り");
  root.querySelector<HTMLInputElement>("[data-kufu-modal-input]")!.value = "ひざを上げる";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(d.onAddKufu).toHaveBeenCalledWith("回し蹴り", "ひざを上げる");
  expect(root.querySelector("[data-kufu-modal]")).not.toBeNull();   // stays open
  expect(d.onKufuChanged).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(root.querySelector("[data-kufu-modal]")).toBeNull();
  expect(bulb.classList.contains("is-lit")).toBe(true);
  expect(d.onKufuChanged).toHaveBeenCalledOnce();
});

it("a full 種目's 💡 still opens so a 工夫 can be erased", () => {
  const root = document.createElement("div");
  const d = kufuDeps({ 前蹴り: ["a", "b", "c"] });
  renderSetupScreen(root, d);
  const bulb = root.querySelector<HTMLButtonElement>("[data-kufu-open]")!;
  expect(bulb.disabled).toBe(false);
  bulb.click();
  expect(root.querySelector("[data-kufu-modal-input]")).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-kufu-modal-remove="1"]')!.click();
  expect(d.onRemoveKufu).toHaveBeenCalledWith("前蹴り", 1);
  expect(root.querySelector("[data-kufu-modal-input]")).not.toBeNull();
});

it("shows 🔥 N日継続中 at the top right when there is a streak, nothing at 0", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ streakDays: 3 }));
  expect(root.querySelector(".toybox-header [data-streak]")!.textContent).toBe("🔥 3日継続中");
  renderSetupScreen(root, deps({ streakDays: 0 }));
  expect(root.querySelector("[data-streak]")).toBeNull();
});
