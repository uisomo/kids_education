import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface StatRow { child: string; stat: string; points: number }

export const POINTS_PER_LEVEL = 50;
export function statLevel(points: number): number {
  return Math.floor(points / POINTS_PER_LEVEL);
}

function readCsv(path: string): string[][] {
  return readFileSync(path, "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
}

function readStats(dataDir: string): StatRow[] {
  const [, ...rows] = readCsv(join(dataDir, "characters.csv"));
  return rows.filter((r) => r.length >= 3)
    .map(([child, stat, points]) => ({ child, stat, points: Number(points) }));
}

function writeStats(dataDir: string, rows: StatRow[]): void {
  const path = join(dataDir, "characters.csv");
  const backup = `${path}.backup.${Date.now()}`;
  copyFileSync(path, backup);
  try {
    const body = ["child,stat,points", ...rows.map((r) => `${r.child},${r.stat},${r.points}`)].join("\n") + "\n";
    writeFileSync(path, body);
    unlinkSync(backup);
  } catch (e) {
    copyFileSync(backup, path);
    unlinkSync(backup);
    throw e;
  }
}

interface Item { required_stat_level: number; required_stat_type: string; japanese_name: string; unlock_message: string }

function readItems(dataDir: string): Item[] {
  const path = join(dataDir, "items_progression.csv");
  if (!existsSync(path)) return [];
  const [header, ...rows] = readCsv(path);
  const col = (name: string) => header.indexOf(name);
  return rows.map((r) => ({
    required_stat_level: Number(r[col("required_stat_level")]),
    required_stat_type: r[col("required_stat_type")],
    japanese_name: r[col("japanese_name")],
    unlock_message: r[col("unlock_message")],
  }));
}

export function getStats(dataDir: string, child: string): StatRow[] {
  return readStats(dataDir).filter((r) => r.child === child);
}

export function applyReward(dataDir: string, child: string, stat: string, xp: number) {
  const rows = readStats(dataDir);
  let row = rows.find((r) => r.child === child && r.stat === stat);
  if (!row) { row = { child, stat, points: 0 }; rows.push(row); }
  const oldLevel = statLevel(row.points);
  row.points += xp;
  const level = statLevel(row.points);
  writeStats(dataDir, rows);

  const unlocked = readItems(dataDir).filter(
    (i) => i.required_stat_type === stat &&
      i.required_stat_level > oldLevel &&  // crossed strictly after old level…
      i.required_stat_level <= level,      // …and reachable at new level
  ).map(({ japanese_name, unlock_message }) => ({ japanese_name, unlock_message }));

  return { stat, points: row.points, level, unlocked };
}
