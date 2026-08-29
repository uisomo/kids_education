import { it, expect, beforeEach } from "vitest";
import {
  loadMembers, getActiveId, getActiveMember, setActive, addMember, removeMember,
} from "../../karate-trainer/src/member-store";
import { scopeKey } from "../../karate-trainer/src/scoped-storage";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("creates a default member on first access", () => {
  const members = loadMembers(s);
  expect(members).toHaveLength(1);
  expect(members[0].name).toBe("じぶん");
  expect(getActiveId(s)).toBe(members[0].id);
});

it("migrates pre-member data into the default member once", () => {
  s.setItem("karate.progress", "OLD-PROGRESS");
  s.setItem("karate_toybox_character_state", "OLD-XP");
  const first = loadMembers(s)[0];
  expect(s.getItem(scopeKey(first.id, "karate.progress"))).toBe("OLD-PROGRESS");
  expect(s.getItem(scopeKey(first.id, "karate_toybox_character_state"))).toBe("OLD-XP");
});

it("grandfathers a pre-E2 install (with existing data) to the Max plan", () => {
  // Existing user: has old progress/XP but no plan stored yet.
  s.setItem("karate.progress", "OLD-PROGRESS");
  const first = loadMembers(s)[0];
  expect(s.getItem(scopeKey(first.id, "karate.plan"))).toBe("max");
});

it("does not set a plan for a fresh install (defaults to Free later)", () => {
  const first = loadMembers(s)[0];   // no pre-E2 data present
  expect(s.getItem(scopeKey(first.id, "karate.plan"))).toBeNull();
});

it("adds a member and makes it active", () => {
  const first = loadMembers(s)[0];
  const kid = addMember("たろう", s);
  expect(loadMembers(s)).toHaveLength(2);
  expect(getActiveId(s)).toBe(kid.id);
  expect(getActiveMember(s).name).toBe("たろう");
  // switch back
  setActive(first.id, s);
  expect(getActiveId(s)).toBe(first.id);
});

it("removes a member; cannot remove the last one", () => {
  const first = loadMembers(s)[0];
  const kid = addMember("はなこ", s);
  removeMember(kid.id, s);
  expect(loadMembers(s)).toHaveLength(1);
  expect(getActiveId(s)).toBe(first.id);   // active fell back
  // last member is protected
  removeMember(first.id, s);
  expect(loadMembers(s)).toHaveLength(1);
});
