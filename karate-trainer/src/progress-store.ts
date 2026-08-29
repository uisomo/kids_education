// Progress store: per-drill cumulative practice counts, keyed by drill name.
// Level = floor(count / 10); the count never resets, but the 10-bar meter fills
// 0..10 within each level (count % 10). Drives the 強さ screen.

const KEY = "karate.progress";
export const PER_LEVEL = 10;

type CountMap = Record<string, number>;

function isCountMap(v: unknown): v is CountMap {
  return !!v && typeof v === "object" && !Array.isArray(v)
    && Object.values(v as Record<string, unknown>).every((n) => typeof n === "number");
}

function load(storage: Storage): CountMap {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isCountMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: CountMap, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore storage errors */
  }
}

// All cumulative counts, keyed by drill name.
export function loadCounts(storage: Storage = localStorage): CountMap {
  return load(storage);
}

// The cumulative count for a single drill (0 if never practiced).
export function countFor(drillName: string, storage: Storage = localStorage): number {
  return load(storage)[drillName] ?? 0;
}

// Increment each named drill by 1 (dedupe so a name repeated in a menu counts
// once per session). Returns the updated map.
export function bumpDrills(names: string[], storage: Storage = localStorage): CountMap {
  const map = load(storage);
  new Set(names).forEach((name) => {
    map[name] = (map[name] ?? 0) + 1;
  });
  write(map, storage);
  return map;
}

export interface LevelInfo {
  level: number;    // completed levels (floor(count / 10))
  inLevel: number;  // bars lit within the current level (0..10)
  count: number;    // raw cumulative count
}

export function levelFor(count: number): LevelInfo {
  return { level: Math.floor(count / PER_LEVEL), inLevel: count % PER_LEVEL, count };
}
