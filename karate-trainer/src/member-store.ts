// Member store: the family's kids (accounts) plus which one is active. Stored
// unprefixed in the base Storage (the member list itself is family-shared). All
// per-member data lives under scopedStorage(base, member.id).
//
// On first access a default member ("じぶん") is created and any pre-member
// (unprefixed) data is migrated once into that member's namespace so existing
// users keep their progress / 工夫 / XP / menu.

import { scopeKey } from "./scoped-storage";

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

function isState(v: unknown): v is MemberState {
  return !!v && typeof v === "object"
    && Array.isArray((v as MemberState).members)
    && (v as MemberState).members.every((m) => m && typeof m.id === "string" && typeof m.name === "string")
    && typeof (v as MemberState).activeId === "string";
}

function read(storage: Storage): MemberState | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(state: MemberState, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
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

// Ensure a member state exists; create a default member (+ migrate) if not.
function ensure(storage: Storage): MemberState {
  const existing = read(storage);
  if (existing && existing.members.length) return existing;
  const first: Member = { id: newId(), name: DEFAULT_NAME };
  const migrated = migrateInto(first.id, storage);
  // Grandfather pre-E2 users to the Max plan: before plans existed they had
  // unlimited presets and 10 工夫, so a Free default would silently regress
  // them. Only migrated (existing) installs are grandfathered; fresh installs
  // are left unset and default to Free via plan-store.
  if (migrated) storage.setItem(scopeKey(first.id, "karate.plan"), "max");
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

// Remove a member. The last member cannot be removed. If the active member is
// removed, the first remaining member becomes active.
export function removeMember(id: string, storage: Storage = localStorage): void {
  const state = ensure(storage);
  if (state.members.length <= 1) return;
  const members = state.members.filter((m) => m.id !== id);
  const activeId = state.activeId === id ? members[0].id : state.activeId;
  write({ members, activeId }, storage);
}
