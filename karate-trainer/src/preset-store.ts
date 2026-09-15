import type { Drill, Menu } from "./types";

export interface Preset {
  id: string;
  name: string;
  menu: Menu;
}

const KEY = "karate.presets";

let seq = 0;
function nextId(): string {
  return `p${Date.now()}-${seq++}`;
}

function isDrill(d: unknown): d is Drill {
  return !!d && typeof d === "object"
    && typeof (d as Drill).name === "string"
    && typeof (d as Drill).seconds === "number" && Number.isFinite((d as Drill).seconds)
    && ((d as Drill).kind === "drill" || (d as Drill).kind === "rest");
}

function isMenu(v: unknown): v is Menu {
  return Array.isArray(v) && v.every(isDrill);
}

function isPreset(p: unknown): p is Preset {
  return !!p && typeof p === "object"
    && typeof (p as Preset).id === "string"
    && typeof (p as Preset).name === "string"
    && isMenu((p as Preset).menu);
}

// Malformed presets are dropped one by one (a single bad entry must not wipe
// the others, nor survive to crash a screen later).
export function loadPresets(storage: Storage = localStorage): Preset[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPreset) : [];
  } catch {
    return [];
  }
}

// Returns false when storage refuses the write (quota / private mode) so tap
// handlers never see a throw.
function writePresets(list: Preset[], storage: Storage): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Save the current menu as a named preset (a deep copy — later edits to the
// working menu must not mutate the stored snapshot). `limit` is the plan's
// menu-count cap (defaults to unlimited): if the list is already at/over the
// cap the save is refused and null is returned. Also returns null when the menu
// is malformed or the write fails. Returns the new preset on success.
export function savePreset(
  name: string,
  menu: Menu,
  storage: Storage = localStorage,
  limit: number = Infinity,
): Preset | null {
  if (!isMenu(menu)) return null;
  const list = loadPresets(storage);
  if (list.length >= limit) return null;
  const preset: Preset = { id: nextId(), name, menu: structuredClone(menu) };
  list.push(preset);
  return writePresets(list, storage) ? preset : null;
}

// Overwrite an existing preset's menu (上書き保存) with a deep copy. Returns
// false if the preset doesn't exist, the menu is malformed, or the write fails.
export function updatePreset(id: string, menu: Menu, storage: Storage = localStorage): boolean {
  if (!isMenu(menu)) return false;
  const list = loadPresets(storage);
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], menu: structuredClone(menu) };
  return writePresets(list, storage);
}

// Returns true when the write succeeded (deleting an unknown id is a
// successful no-op).
export function deletePreset(id: string, storage: Storage = localStorage): boolean {
  return writePresets(loadPresets(storage).filter((p) => p.id !== id), storage);
}
