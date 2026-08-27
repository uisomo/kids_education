import type { Drill, Menu } from "./types";

const KEY = "karate.menu";

export const DEFAULT_MENU: Menu = [
  { id: "d1", name: "前蹴り", seconds: 30, kind: "drill" },
  { id: "d2", name: "回し蹴り", seconds: 30, kind: "drill" },
  { id: "d3", name: "休憩", seconds: 15, kind: "rest" },
  { id: "d4", name: "追い突き", seconds: 45, kind: "drill" },
  { id: "d5", name: "平安初段", seconds: 60, kind: "drill" },
];

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
    return isMenu(parsed) ? parsed : structuredClone(DEFAULT_MENU);
  } catch {
    return structuredClone(DEFAULT_MENU);
  }
}

export function saveMenu(menu: Menu, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(menu));
}

export function totalSeconds(menu: Menu): number {
  return menu.reduce((sum, d) => sum + d.seconds, 0);
}

export function formatMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
