// 工夫 (kufu) store: per-drill improvement notes the child writes on the done
// screen. Keyed by drill name, keep the latest 10, each capped at 15 chars.
// The latest note is shown during the next practice (and burned into the
// recording via the compositor).

const KEY = "karate.kufu";
export const KUFU_MAX_LEN = 15;
const HISTORY_LIMIT = 10;

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

// The most recent note for a drill, or "" if none.
export function latestKufu(drillName: string, storage: Storage = localStorage): string {
  return loadKufu(drillName, storage)[0] ?? "";
}

// Add a note (trimmed + capped to 15 chars) as the newest entry. Empty input is
// ignored. Keeps at most 10 per drill. Returns the updated history.
export function addKufu(
  drillName: string,
  text: string,
  storage: Storage = localStorage,
): string[] {
  const clean = text.trim().slice(0, KUFU_MAX_LEN);
  if (!clean) return loadKufu(drillName, storage);
  const map = load(storage);
  const next = [clean, ...(map[drillName] ?? [])].slice(0, HISTORY_LIMIT);
  map[drillName] = next;
  write(map, storage);
  return next;
}
