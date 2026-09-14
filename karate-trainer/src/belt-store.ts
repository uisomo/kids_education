// Belt store: each member's 帯 (belt) and the 10-bar meter toward the next one.
// Finishing a whole practice fills one bar; the 10th bar moves up to the next
// belt and the meter starts over. Stopping a practice partway fills nothing
// (see KarateApp.finishSession). Parents can set any belt from the 家族 tab,
// which also resets the meter. Stored per-member through mem(), like menu /
// kufu / progress.

import { loadCharacterState } from "./character-store";

export interface BeltDef {
  name: string;   // 白帯, クリスタルの帯, …
  icon: string;   // shown before the name (RPG belts only)
  fill: string;   // CSS background for the drawn obi (color or gradient)
  ink: string;    // knot outline that reads against the fill
  rpg: boolean;   // RPG belts get the gold frame and shimmer
}

export const BELTS: BeltDef[] = [
  { name: "白帯", icon: "", fill: "#f5f5f4", ink: "#a8a29e", rpg: false },
  { name: "黄帯", icon: "", fill: "#facc15", ink: "#a16207", rpg: false },
  { name: "オレンジ帯", icon: "", fill: "#fb923c", ink: "#c2410c", rpg: false },
  { name: "緑帯", icon: "", fill: "#22c55e", ink: "#15803d", rpg: false },
  { name: "青帯", icon: "", fill: "#3b82f6", ink: "#1d4ed8", rpg: false },
  { name: "紫帯", icon: "", fill: "#a855f7", ink: "#7e22ce", rpg: false },
  { name: "茶帯", icon: "", fill: "#92400e", ink: "#451a03", rpg: false },
  { name: "黒帯", icon: "", fill: "#1c1917", ink: "#78716c", rpg: false },
  { name: "ほのおの帯", icon: "🔥", fill: "linear-gradient(90deg, #b91c1c, #f97316, #facc15, #f97316, #b91c1c)", ink: "#7f1d1d", rpg: true },
  { name: "いかずちの帯", icon: "⚡", fill: "linear-gradient(90deg, #1e3a8a, #3b82f6, #fde047, #3b82f6, #1e3a8a)", ink: "#172554", rpg: true },
  { name: "クリスタルの帯", icon: "🔮", fill: "linear-gradient(90deg, #a5f3fc, #e0e7ff, #c4b5fd, #e0e7ff, #a5f3fc)", ink: "#7c3aed", rpg: true },
  { name: "ダイヤモンドの帯", icon: "💎", fill: "linear-gradient(90deg, #bae6fd, #ffffff, #7dd3fc, #ffffff, #bae6fd)", ink: "#0284c7", rpg: true },
  { name: "ドラゴンの帯", icon: "🐉", fill: "linear-gradient(90deg, #064e3b, #10b981, #fbbf24, #10b981, #064e3b)", ink: "#022c22", rpg: true },
  { name: "でんせつの帯", icon: "🌟", fill: "linear-gradient(90deg, #f43f5e, #f59e0b, #facc15, #22c55e, #3b82f6, #a855f7)", ink: "#ffffff", rpg: true },
];

export const BARS_PER_BELT = 10;

export interface BeltState {
  index: number; // into BELTS
  bars: number;  // 0..9, or up to 10 on the last belt (which has nowhere to go)
}

const KEY = "karate.belt";
const LAST = BELTS.length - 1;
const DEFAULT: BeltState = { index: 0, bars: 0 };

// Old XP thresholds → the matching new belt, so nobody loses a belt when this
// replaces XP: 黄 100, 緑 250, 茶 500, 黒 1000 (below 100 stays 白).
const LEGACY_XP: [minXp: number, index: number][] = [[1000, 7], [500, 6], [250, 3], [100, 1]];

function clampIndex(i: number): number {
  return Math.min(LAST, Math.max(0, Math.floor(i)));
}

function save(state: BeltState, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
  }
}

export function loadBelt(storage: Storage = localStorage): BeltState {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) {
      // First look since belts replaced XP: carry the old belt over, once.
      const xp = loadCharacterState(storage).totalXp;
      const migrated: BeltState = { index: LEGACY_XP.find(([min]) => xp >= min)?.[1] ?? 0, bars: 0 };
      save(migrated, storage);
      return migrated;
    }
    const p = JSON.parse(raw) as Partial<BeltState>;
    if (typeof p.index !== "number" || typeof p.bars !== "number") return { ...DEFAULT };
    const index = clampIndex(p.index);
    const maxBars = index === LAST ? BARS_PER_BELT : BARS_PER_BELT - 1;
    return { index, bars: Math.min(maxBars, Math.max(0, Math.floor(p.bars))) };
  } catch {
    return { ...DEFAULT };
  }
}

// One finished practice: fill a bar, moving up a belt on the 10th.
export function addSessionBar(storage: Storage = localStorage): { state: BeltState; promoted: boolean } {
  const cur = loadBelt(storage);
  let state: BeltState;
  let promoted = false;
  if (cur.index === LAST) {
    state = { index: LAST, bars: Math.min(BARS_PER_BELT, cur.bars + 1) };
  } else if (cur.bars + 1 >= BARS_PER_BELT) {
    state = { index: cur.index + 1, bars: 0 };
    promoted = true;
  } else {
    state = { index: cur.index, bars: cur.bars + 1 };
  }
  save(state, storage);
  return { state, promoted };
}

// Parent sets a belt directly; the meter starts over.
export function setBelt(index: number, storage: Storage = localStorage): BeltState {
  const state: BeltState = { index: clampIndex(index), bars: 0 };
  save(state, storage);
  return state;
}
