// Class store (Tower E3): which class a member belongs to. A "class" is just an
// existing family-shared preset (see preset-store) — there is no separate class
// entity. This store only records the assigned preset id per member (scoped
// storage), the parent's answer to "which menu is this kid's class".
//
// Assigning a class copies that preset's menu into the member's working menu as
// a starting point (done in app.ts); this store just holds the id so the setup
// screen can label it and re-assignment is idempotent.

import type { Preset } from "./preset-store";

const KEY = "karate.assignedClass";

// The member's assigned class (preset) id, or null if unassigned. A stored id
// that no longer resolves to a preset (the class was deleted family-wide) is
// treated as unassigned so a dangling record never drives the menu.
export function getAssignedClass(
  presets: Preset[],
  storage: Storage = localStorage,
): string | null {
  let id: string | null;
  try {
    id = storage.getItem(KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  return presets.some((p) => p.id === id) ? id : null;
}

// Set (or clear, when id is null) the member's assigned class.
export function setAssignedClass(
  id: string | null,
  storage: Storage = localStorage,
): void {
  try {
    if (id === null) storage.removeItem(KEY);
    else storage.setItem(KEY, id);
  } catch {
    /* ignore storage errors */
  }
}
