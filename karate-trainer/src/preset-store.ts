import type { Menu } from "./types";

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

function isPresetList(v: unknown): v is Preset[] {
  return Array.isArray(v) && v.every(
    (p) => p && typeof (p as Preset).id === "string"
      && typeof (p as Preset).name === "string"
      && Array.isArray((p as Preset).menu),
  );
}

export function loadPresets(storage: Storage = localStorage): Preset[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return isPresetList(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(list: Preset[], storage: Storage): void {
  storage.setItem(KEY, JSON.stringify(list));
}

// Save the current menu as a named preset (a deep copy — later edits to the
// working menu must not mutate the stored snapshot). Returns the new preset.
export function savePreset(name: string, menu: Menu, storage: Storage = localStorage): Preset {
  const preset: Preset = { id: nextId(), name, menu: structuredClone(menu) };
  const list = loadPresets(storage);
  list.push(preset);
  writePresets(list, storage);
  return preset;
}

export function deletePreset(id: string, storage: Storage = localStorage): void {
  writePresets(loadPresets(storage).filter((p) => p.id !== id), storage);
}
