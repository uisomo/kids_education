// 工夫 (kufu) store: per-drill improvement notes the child writes on the done
// screen. Keyed by drill name, keep the latest 10, each capped at 15 chars.
// The latest note is shown during the next practice (and burned into the
// recording via the compositor).

const KEY = "karate.kufu";
export const KUFU_MAX_LEN = 15;
// Default history cap when no plan limit is passed (Max plan / legacy callers).
const DEFAULT_HISTORY_LIMIT = 10;

type KufuMap = Record<string, string[]>;

function isKufuMap(v: unknown): v is KufuMap {
  return !!v && typeof v === "object" && !Array.isArray(v)
    && Object.values(v as Record<string, unknown>).every(
      (arr) => Array.isArray(arr) && arr.every((s) => typeof s === "string"),
    );
}

function load(storage: Storage): KufuMap {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isKufuMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: KufuMap, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore storage errors */
  }
}

// Full history for a drill, newest first (max 10).
export function loadKufu(drillName: string, storage: Storage = localStorage): string[] {
  return load(storage)[drillName] ?? [];
}

// Trim every drill's history down to `limit` newest entries (0 clears all),
// then drop whole drills (oldest-note-first) until at most `maxDrills` remain
// — Free plan (maxDrills 1) keeps only the single most-recently-written 種目.
// Used on a plan downgrade to enforce the new 工夫 caps immediately.
export function trimKufuHistory(
  limit: number,
  storage: Storage = localStorage,
  maxDrills: number = Infinity,
): void {
  if (limit <= 0) {
    write({}, storage);
    return;
  }
  const map = load(storage);
  for (const drill of Object.keys(map)) map[drill] = map[drill].slice(0, limit);
  trimToDrillCap(map, maxDrills);
  write(map, storage);
}

// Keep only the `maxDrills` drills with the most recent writes (each drill's
// history is newest-first, so history[0] is that drill's latest timestamp
// order — since writes aren't timestamped, insertion order into `map`'s own
// key order isn't reliable either, so callers that need "most recent" pass
// the just-written drill separately; this helper is only ever used for the
// plan-downgrade case where any deterministic choice is acceptable).
function trimToDrillCap(map: KufuMap, maxDrills: number): void {
  const drills = Object.keys(map);
  if (drills.length <= maxDrills) return;
  for (const drill of drills.slice(0, drills.length - maxDrills)) delete map[drill];
}

// The most recent note for a drill, or "" if none.
export function latestKufu(drillName: string, storage: Storage = localStorage): string {
  return loadKufu(drillName, storage)[0] ?? "";
}

// Whether `drillName` may currently receive a NEW 工夫 note — true if it
// already has one (always updatable) or the maxDrills cap isn't yet reached.
// Drives disabling the 💡 button / save button for other 種目 once a Free
// plan's single slot is used.
export function canAddKufu(
  drillName: string,
  storage: Storage = localStorage,
  maxDrills: number = Infinity,
): boolean {
  const map = load(storage);
  if (map[drillName]?.length) return true;
  const usedDrills = Object.keys(map).filter((d) => map[d].length).length;
  return usedDrills < maxDrills;
}

// Add a note (trimmed + capped to 15 chars) as the newest entry. Empty input is
// ignored. `limit` is the plan's per-drill history cap (defaults to 10 for
// legacy callers): a limit of 0 saves nothing, and any lower limit trims
// existing over-limit history on this write (handles a plan downgrade).
// `maxDrills` caps how many DISTINCT 種目 may have any saved note at once —
// Free plan (maxDrills 1) can write to a new 種目 only once no other 種目 has
// a note; a 種目 that already has one can still be updated freely. Returns
// history for `drillName` (unchanged if the write was refused by either cap).
export function addKufu(
  drillName: string,
  text: string,
  storage: Storage = localStorage,
  limit: number = DEFAULT_HISTORY_LIMIT,
  maxDrills: number = Infinity,
): string[] {
  if (limit <= 0) return loadKufu(drillName, storage);
  const clean = text.trim().slice(0, KUFU_MAX_LEN);
  if (!clean) return loadKufu(drillName, storage);
  const map = load(storage);
  const isNewDrill = !map[drillName]?.length;
  const usedDrills = Object.keys(map).filter((d) => map[d].length).length;
  if (isNewDrill && usedDrills >= maxDrills) return loadKufu(drillName, storage);
  const next = [clean, ...(map[drillName] ?? [])].slice(0, limit);
  map[drillName] = next;
  write(map, storage);
  return next;
}
