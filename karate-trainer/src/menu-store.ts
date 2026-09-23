import type { Drill, Menu } from "./types";
import { IS_PIANO } from "./flavor";

const KEY = "karate.menu";

// 基本: where every new kid starts — five basic moves, 30 s each, with a 30 s
// 休憩 between them (4:30). Also the built-in 基本 saved menu (preset-store).
const KARATE_MENU: Menu = [
  { id: "d1", name: "正拳突き", seconds: 30, kind: "drill" },
  { id: "d2", name: "休憩", seconds: 30, kind: "rest" },
  { id: "d3", name: "上段揚げ受け", seconds: 30, kind: "drill" },
  { id: "d4", name: "休憩", seconds: 30, kind: "rest" },
  { id: "d5", name: "前蹴り", seconds: 30, kind: "drill" },
  { id: "d6", name: "休憩", seconds: 30, kind: "rest" },
  { id: "d7", name: "下段払い", seconds: 30, kind: "drill" },
  { id: "d8", name: "休憩", seconds: 30, kind: "rest" },
  { id: "d9", name: "回し蹴り", seconds: 30, kind: "drill" },
];

// The piano app's 基本: a warm-up, both hands apart, then together — a minute
// each (5:00). No 休憩: sitting at the piano isn't the same kind of tired as
// 正拳突き, so the piano app has no rest at all (like its missing BGM).
const PIANO_MENU: Menu = [
  { id: "d1", name: "指のたいそう", seconds: 60, kind: "drill" },
  { id: "d2", name: "ドレミの音階", seconds: 60, kind: "drill" },
  { id: "d3", name: "右手の練習", seconds: 60, kind: "drill" },
  { id: "d4", name: "左手の練習", seconds: 60, kind: "drill" },
  { id: "d5", name: "両手で ひいてみよう", seconds: 60, kind: "drill" },
];

export const DEFAULT_MENU: Menu = IS_PIANO ? PIANO_MENU : KARATE_MENU;

// 休憩 does not exist in the piano app, but a menu can still arrive with rest
// rows in it — saved by an older piano build, or restored from a karate
// backup. Drop them on the way in so no 休憩 ever reaches the list, the timer
// or a saved video. Karate menus pass through untouched.
export function withoutRests(menu: Menu): Menu {
  return IS_PIANO && menu.some((d) => d.kind === "rest")
    ? menu.filter((d) => d.kind !== "rest")
    : menu;
}

function isMenu(v: unknown): v is Menu {
  return Array.isArray(v) && v.every(
    (d) => d && typeof (d as Drill).name === "string"
      && typeof (d as Drill).seconds === "number"
      && ((d as Drill).kind === "drill" || (d as Drill).kind === "rest"),
  );
}

export function loadMenu(storage: Storage = localStorage): Menu {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_MENU);
    const parsed = JSON.parse(raw);
    if (!isMenu(parsed)) return structuredClone(DEFAULT_MENU);
    const menu = withoutRests(parsed);
    // Write the stripped menu straight back. Filtering on the way in alone
    // would leave the 休憩 rows sitting in storage (and in the native
    // karate-backup.json the app mirrors them to), so every restore would
    // bring them round again. A refused write (quota / private mode) just
    // means the stripping happens again next launch.
    if (menu.length !== parsed.length) {
      try { saveMenu(menu, storage); } catch { /* keep the stripped menu anyway */ }
    }
    return menu;
  } catch {
    return structuredClone(DEFAULT_MENU);
  }
}

export function saveMenu(menu: Menu, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(menu));
}

// Longest menu that may be recorded. Saved videos run ~110 MB a minute
// (measured on the iPhone 16), so 10 minutes is already about 1.1 GB.
export const MAX_RECORD_SECONDS = 600;

// Free space a recording of `seconds` needs while it is being saved: the raw
// capture, the voice file and the finished video exist at once (~240 MB a
// minute), plus headroom.
export function recordingBytesNeeded(seconds: number): number {
  return Math.ceil(seconds) * 4_000_000 + 300_000_000;
}

export function totalSeconds(menu: Menu): number {
  return menu.reduce((sum, d) => sum + d.seconds, 0);
}

export function formatMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
