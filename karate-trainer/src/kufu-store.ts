// 工夫 (kufu) store: the child's improvement notes per drill, keyed by drill
// name, newest first, each capped at 15 chars. The newest usable note is shown
// during practice and burned into the recording (via the compositor).
//
// Plan caps (see plan-store): at most `perDrill` notes per 種目 and `total`
// notes per member. A downgrade never deletes: notes past the caps stay stored
// but locked (hidden and not counted) and come back on upgrade.

const KEY = "karate.kufu";
export const KUFU_MAX_LEN = 15;

export interface KufuCaps {
  perDrill: number;
  total: number;
}

const NO_CAPS: KufuCaps = { perDrill: Infinity, total: Infinity };

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

// The notes the caps let the member use: drills in stored order, each drill's
// newest `perDrill`, until `total` is used up. Deterministic, so the same
// notes stay visible between screens.
function usable(map: KufuMap, caps: KufuCaps): KufuMap {
  const out: KufuMap = {};
  let left = caps.total;
  for (const drill of Object.keys(map)) {
    const n = Math.max(0, Math.min(map[drill].length, caps.perDrill, left));
    if (n > 0) out[drill] = map[drill].slice(0, n);
    left -= n;
  }
  return out;
}

const countOf = (map: KufuMap): number => Object.values(map).reduce((n, list) => n + list.length, 0);

// Everything stored for a drill (locked notes included), newest first.
export function loadKufu(drillName: string, storage: Storage = localStorage): string[] {
  return load(storage)[drillName] ?? [];
}

// The drill's notes the plan lets the member use, newest first.
export function kufuNotes(drillName: string, storage: Storage = localStorage, caps: KufuCaps = NO_CAPS): string[] {
  return usable(load(storage), caps)[drillName] ?? [];
}

// The newest usable note for a drill, or "".
export function latestKufu(drillName: string, storage: Storage = localStorage, caps: KufuCaps = NO_CAPS): string {
  return kufuNotes(drillName, storage, caps)[0] ?? "";
}

// How many notes the member has stored (for 「工夫をぜんぶけす」).
export function countKufu(storage: Storage = localStorage): number {
  return countOf(load(storage));
}

// Whether the drill may get one more note: under its per-種目 cap and under
// the member's total.
export function canAddKufu(drillName: string, storage: Storage = localStorage, caps: KufuCaps = NO_CAPS): boolean {
  if (caps.perDrill <= 0 || caps.total <= 0) return false;
  const used = usable(load(storage), caps);
  return (used[drillName]?.length ?? 0) < caps.perDrill && countOf(used) < caps.total;
}

// Add a note (trimmed, capped to 15 chars) as the drill's newest. Empty input
// or a full drill / member is ignored. Returns the drill's usable notes.
export function addKufu(
  drillName: string,
  text: string,
  storage: Storage = localStorage,
  caps: KufuCaps = NO_CAPS,
): string[] {
  const clean = text.trim().slice(0, KUFU_MAX_LEN);
  if (clean && canAddKufu(drillName, storage, caps)) {
    const map = load(storage);
    map[drillName] = [clean, ...(map[drillName] ?? [])];
    write(map, storage);
  }
  return kufuNotes(drillName, storage, caps);
}

// Erase one note (index into the newest-first list — usable notes are always
// its first entries, so the card's index is the stored index).
export function removeKufuAt(drillName: string, index: number, storage: Storage = localStorage): void {
  const map = load(storage);
  const list = map[drillName];
  if (!list || index < 0 || index >= list.length) return;
  list.splice(index, 1);
  if (!list.length) delete map[drillName];
  write(map, storage);
}

// Erase every note for a drill.
export function removeKufu(drillName: string, storage: Storage = localStorage): void {
  const map = load(storage);
  if (!(drillName in map)) return;
  delete map[drillName];
  write(map, storage);
}

// 「工夫をぜんぶけす」: erase every note the member has, locked ones included.
export function clearAllKufu(storage: Storage = localStorage): void {
  write({}, storage);
}

// A renamed row takes its notes along, so the old name doesn't keep using
// the cap. If the new name already has notes, those win and the old ones go.
export function renameKufu(from: string, to: string, storage: Storage = localStorage): void {
  if (from === to) return;
  const map = load(storage);
  if (!map[from]) return;
  if (!map[to]?.length) map[to] = map[from];
  delete map[from];
  write(map, storage);
}

// Drop notes for drills that appear in no menu at all (e.g. a row deleted or
// renamed before notes followed it) — nothing can show them, yet they would
// keep counting toward the cap.
export function pruneKufu(keepNames: Iterable<string>, storage: Storage = localStorage): void {
  const keep = new Set(keepNames);
  const map = load(storage);
  const orphans = Object.keys(map).filter((d) => !keep.has(d));
  if (!orphans.length) return;
  for (const d of orphans) delete map[d];
  write(map, storage);
}
