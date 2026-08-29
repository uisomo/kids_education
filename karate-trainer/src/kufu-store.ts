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

// Trim every drill's history down to `limit` newest entries (0 clears all).
// Used on a plan downgrade to enforce the new 工夫 cap immediately.
export function trimKufuHistory(limit: number, storage: Storage = localStorage): void {
  if (limit <= 0) {
    write({}, storage);
    return;
  }
  const map = load(storage);
  for (const drill of Object.keys(map)) map[drill] = map[drill].slice(0, limit);
  write(map, storage);
}

// The most recent note for a drill, or "" if none.
export function latestKufu(drillName: string, storage: Storage = localStorage): string {
  return loadKufu(drillName, storage)[0] ?? "";
}

// Add a note (trimmed + capped to 15 chars) as the newest entry. Empty input is
// ignored. `limit` is the plan's 工夫 cap (defaults to 10 for legacy callers):
// a limit of 0 (Free plan) saves nothing, and any lower limit trims existing
// over-limit history on this write (handles a plan downgrade). Returns history.
export function addKufu(
  drillName: string,
  text: string,
  storage: Storage = localStorage,
  limit: number = DEFAULT_HISTORY_LIMIT,
): string[] {
  if (limit <= 0) return loadKufu(drillName, storage);
  const clean = text.trim().slice(0, KUFU_MAX_LEN);
  if (!clean) return loadKufu(drillName, storage);
  const map = load(storage);
  const next = [clean, ...(map[drillName] ?? [])].slice(0, limit);
  map[drillName] = next;
  write(map, storage);
  return next;
}
