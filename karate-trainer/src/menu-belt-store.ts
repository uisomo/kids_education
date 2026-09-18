// 帯 and 強さ per saved menu (preset), per member (read/written through mem()).
//
// Each drill of a menu has a level 0..10: +1 whenever it runs down to 0 in a
// practice that reaches the end. The menu's belt bars are the LOWEST level
// among its drills, so one drill racing ahead to 10 doesn't move the belt —
// it waits there for the others. When every drill is at 10 the belt goes up
// one and every level starts over from 0. A practice on a menu that was never
// saved earns nothing: there is no menu to hang the belt on.

import type { Menu } from "./types";
import { BELTS, BARS_PER_BELT, loadBelt, type BeltState } from "./belt-store";

const KEY = "karate.menuBelts";
const SELECTED_KEY = "karate.selectedPreset";
export const MAX_LEVEL = BARS_PER_BELT;
const LAST = BELTS.length - 1;

export interface MenuBelt {
  belt: number;                    // index into BELTS
  levels: Record<string, number>;  // drill name (trimmed) → 0..MAX_LEVEL
}

type BeltMap = Record<string, MenuBelt>;

function isMenuBelt(v: unknown): v is MenuBelt {
  const b = v as MenuBelt;
  return !!b && typeof b === "object" && typeof b.belt === "number"
    && !!b.levels && typeof b.levels === "object" && !Array.isArray(b.levels)
    && Object.values(b.levels).every((n) => typeof n === "number");
}

function load(storage: Storage): BeltMap {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // A corrupt entry drops alone instead of wiping every menu's belt.
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isMenuBelt(v))) as BeltMap;
  } catch {
    return {};
  }
}

function write(map: BeltMap, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore storage errors */
  }
}

const clampBelt = (i: number): number => Math.min(LAST, Math.max(0, Math.floor(i)));

// The drills that count for a menu: unique, trimmed, named, not 休憩.
export function drillNames(menu: Menu): string[] {
  return [...new Set(menu.filter((d) => d.kind !== "rest").map((d) => d.name.trim()).filter(Boolean))];
}

// A menu seen for the first time starts on the member's belt from before belts
// were per menu, with every drill at level 0.
export function loadMenuBelt(presetId: string, storage: Storage = localStorage): MenuBelt {
  const found = load(storage)[presetId];
  if (found) return { belt: clampBelt(found.belt), levels: { ...found.levels } };
  return { belt: loadBelt(storage).index, levels: {} };
}

export function levelOf(mb: MenuBelt, drillName: string): number {
  const n = mb.levels[drillName.trim()] ?? 0;
  return Math.min(MAX_LEVEL, Math.max(0, Math.floor(n)));
}

// The belt card's state for a menu: its belt, and bars = the lowest drill level.
export function beltStateFor(mb: MenuBelt, menu: Menu): BeltState {
  const names = drillNames(menu);
  const bars = names.length ? Math.min(...names.map((n) => levelOf(mb, n))) : 0;
  return { index: mb.belt, bars };
}

// One practice run to the end on a saved menu: every finished drill gains a
// level (once per name, capped at 10). If that brings every drill of `menu`
// to 10, the belt goes up and all levels reset. The top belt stays full.
export function recordPractice(
  presetId: string,
  menu: Menu,
  finishedDrills: string[],
  storage: Storage = localStorage,
): { state: BeltState; promoted: boolean } {
  const mb = loadMenuBelt(presetId, storage);
  for (const name of new Set(finishedDrills.map((n) => n.trim()).filter(Boolean))) {
    mb.levels[name] = Math.min(MAX_LEVEL, levelOf(mb, name) + 1);
  }
  const names = drillNames(menu);
  let promoted = false;
  if (names.length && mb.belt < LAST && names.every((n) => levelOf(mb, n) >= MAX_LEVEL)) {
    mb.belt += 1;
    mb.levels = {};
    promoted = true;
  }
  const map = load(storage);
  map[presetId] = mb;
  write(map, storage);
  return { state: beltStateFor(mb, menu), promoted };
}

// Parent sets a menu's belt directly (家族 tab); its 強さ starts over.
export function setMenuBelt(presetId: string, index: number, storage: Storage = localStorage): MenuBelt {
  const mb: MenuBelt = { belt: clampBelt(index), levels: {} };
  const map = load(storage);
  map[presetId] = mb;
  write(map, storage);
  return mb;
}

// test アプリ only (家族 → テスト用): set one drill's level directly. Unlike a
// practice this never promotes, so every drill can be parked at Lv.10 to try
// the next practice's belt-up.
export function setDrillLevel(presetId: string, drillName: string, level: number, storage: Storage = localStorage): MenuBelt {
  const mb = loadMenuBelt(presetId, storage);
  const name = drillName.trim();
  if (name) mb.levels[name] = Math.min(MAX_LEVEL, Math.max(0, Math.floor(level) || 0));
  const map = load(storage);
  map[presetId] = mb;
  write(map, storage);
  return mb;
}

// A deleted menu takes its belt with it.
export function removeMenuBelt(presetId: string, storage: Storage = localStorage): void {
  const map = load(storage);
  if (!(presetId in map)) return;
  delete map[presetId];
  write(map, storage);
}

// The saved menu this member practices (whose belt fills), or null.
export function getSelectedPreset(storage: Storage = localStorage): string | null {
  try {
    return storage.getItem(SELECTED_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedPreset(id: string | null, storage: Storage = localStorage): void {
  try {
    if (id) storage.setItem(SELECTED_KEY, id);
    else storage.removeItem(SELECTED_KEY);
  } catch {
    /* ignore storage errors */
  }
}
