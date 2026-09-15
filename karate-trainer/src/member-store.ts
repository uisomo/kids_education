// Member store: the family's kids (accounts) plus which one is active. Stored
// unprefixed in the base Storage (the member list itself is family-shared). All
// per-member data lives under scopedStorage(base, member.id).
//
// On first access a default member ("じぶん") is created and any pre-member
// (unprefixed) data is migrated once into that member's namespace so existing
// users keep their progress / 工夫 / XP / menu.

import { scopeKey, scopedKeysOf } from "./scoped-storage";

export interface Member {
  id: string;
  name: string;
}

interface MemberState {
  members: Member[];
  activeId: string;
}

const KEY = "karate.members";
const DEFAULT_NAME = "じぶん";

// Pre-member (unprefixed) keys migrated into the default member on first run.
const MIGRATE_KEYS = [
  "karate.menu",
  "karate.kufu",
  "karate.progress",
  "karate_toybox_character_state",
];

let seq = 0;
function newId(): string {
  return `m${Date.now()}-${seq++}`;
}

function isMember(m: unknown): m is Member {
  return !!m && typeof m === "object"
    && typeof (m as Member).id === "string" && (m as Member).id !== ""
    && typeof (m as Member).name === "string";
}

const CORRUPT_KEY = "karate.members.corrupt";

interface ReadResult {
  state: MemberState | null;
  // True when a raw value existed but was unparseable or partly invalid, so the
  // value about to be written differs from what was stored.
  damaged: boolean;
  raw: string | null;
}

// Parse leniently: keep every valid member, drop only bad entries, de-dupe ids,
// and repair a missing/unknown activeId.
function read(storage: Storage): ReadResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return { state: null, damaged: false, raw: null };
  }
  if (!raw) return { state: null, damaged: false, raw };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: null, damaged: true, raw };
  }
  const obj = parsed && typeof parsed === "object" ? parsed as Partial<MemberState> : null;
  const list = obj && Array.isArray(obj.members) ? obj.members as unknown[] : null;
  if (!list) return { state: null, damaged: true, raw };
  const seen = new Set<string>();
  const members: Member[] = [];
  for (const m of list) {
    if (!isMember(m) || seen.has(m.id)) continue;
    seen.add(m.id);
    members.push({ id: m.id, name: m.name });
  }
  let damaged = members.length !== list.length;
  if (!members.length) return { state: null, damaged: true, raw };
  let activeId = obj!.activeId;
  if (typeof activeId !== "string" || !seen.has(activeId)) {
    activeId = members[0].id;
    damaged = true;
  }
  return { state: { members, activeId }, damaged, raw };
}

// Member ids that still own `m:<id>:*` data in storage (in first-seen order).
function orphanIds(storage: Storage): string[] {
  const ids: string[] = [];
  try {
    const n = Number(storage.length) || 0;
    if (typeof storage.key !== "function") return ids;
    for (let i = 0; i < n; i++) {
      const k = storage.key(i);
      if (typeof k !== "string" || !k.startsWith("m:")) continue;
      const end = k.indexOf(":", 2);
      if (end <= 2) continue;
      const id = k.slice(2, end);
      if (!ids.includes(id)) ids.push(id);
    }
  } catch {
    /* not enumerable */
  }
  return ids;
}

// Delete every `m:<id>:*` key of one member (collect first, then remove).
export function purgeMemberData(id: string, storage: Storage = localStorage): void {
  for (const k of scopedKeysOf(storage, id)) {
    try { storage.removeItem(k); } catch { /* ignore */ }
  }
}

function write(state: MemberState, storage: Storage): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    /* ignore storage errors */
    return false;
  }
}

// Move existing unprefixed data into the given member's namespace (once).
// Returns true if any pre-member data was actually migrated (i.e. this was a
// pre-E1 install with existing progress), false for a fresh install.
function migrateInto(memberId: string, storage: Storage): boolean {
  let migrated = false;
  for (const key of MIGRATE_KEYS) {
    const val = storage.getItem(key);
    if (val === null) continue;
    const scoped = scopeKey(memberId, key);
    if (storage.getItem(scoped) === null) storage.setItem(scoped, val);
    migrated = true;
  }
  return migrated;
}

// Ensure a member state exists. Damaged lists are repaired without orphaning
// anyone's data: valid entries are kept; if none survive but per-member data is
// still in storage, members are rebuilt from those ids. Only a truly empty
// install gets a fresh default member (+ migration).
function ensure(storage: Storage): MemberState {
  const { state: existing, damaged, raw } = read(storage);
  const backupCorrupt = () => {
    if (!damaged || raw === null) return;
    try { storage.setItem(CORRUPT_KEY, raw); } catch { /* ignore */ }
  };
  if (existing) {
    if (damaged) { backupCorrupt(); write(existing, storage); }
    return existing;
  }
  const ids = orphanIds(storage);
  if (ids.length) {
    backupCorrupt();
    const members = ids.map((id, i) => ({ id, name: `メンバー${i + 1}` }));
    const rebuilt: MemberState = { members, activeId: members[0].id };
    write(rebuilt, storage);
    return rebuilt;
  }
  backupCorrupt();
  const first: Member = { id: newId(), name: DEFAULT_NAME };
  const migrated = migrateInto(first.id, storage);
  // Grandfather pre-E2 users to the Max plan: before plans existed they had
  // unlimited presets and 10 工夫, so a Free default would silently regress
  // them. Only migrated (existing) installs are grandfathered; fresh installs
  // are left unset and default to Free via plan-store.
  if (migrated) storage.setItem(scopeKey(first.id, "karate.plan"), "max");   // plan-store carries this over as Premium
  const state: MemberState = { members: [first], activeId: first.id };
  write(state, storage);
  return state;
}

export function loadMembers(storage: Storage = localStorage): Member[] {
  return ensure(storage).members;
}

export function getActiveId(storage: Storage = localStorage): string {
  return ensure(storage).activeId;
}

export function getActiveMember(storage: Storage = localStorage): Member {
  const state = ensure(storage);
  return state.members.find((m) => m.id === state.activeId) ?? state.members[0];
}

export function setActive(id: string, storage: Storage = localStorage): void {
  const state = ensure(storage);
  if (!state.members.some((m) => m.id === id)) return;
  write({ ...state, activeId: id }, storage);
}

export function addMember(name: string, storage: Storage = localStorage): Member {
  const state = ensure(storage);
  const member: Member = { id: newId(), name: name.trim() || DEFAULT_NAME };
  write({ members: [...state.members, member], activeId: member.id }, storage);
  return member;
}

// Remove a member and all of their `m:<id>:*` data. The last member cannot be
// removed. If the active member is removed, the first remaining member becomes
// active.
// Rename a member (trimmed). Empty names and unknown ids are ignored.
export function renameMember(id: string, name: string, storage: Storage = localStorage): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const state = ensure(storage);
  if (!state.members.some((m) => m.id === id)) return false;
  return write({ ...state, members: state.members.map((m) => (m.id === id ? { ...m, name: clean } : m)) }, storage);
}

export function removeMember(id: string, storage: Storage = localStorage): void {
  const state = ensure(storage);
  if (state.members.length <= 1) return;
  const members = state.members.filter((m) => m.id !== id);
  if (members.length === state.members.length) return;   // unknown id
  const activeId = state.activeId === id ? members[0].id : state.activeId;
  // Only purge once the member is really gone from the list, so a failed write
  // never leaves a listed member without data.
  if (write({ members, activeId }, storage)) purgeMemberData(id, storage);
}
