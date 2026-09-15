import { it, expect, beforeEach } from "vitest";
import {
  loadMembers, getActiveId, getActiveMember, setActive, addMember, removeMember, renameMember, purgeMemberData,
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

// An enumerable Storage double (key()/length work) like real localStorage.
function enumStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

it("keeps valid members and drops only the malformed entry", () => {
  const e = enumStorage();
  e.setItem("karate.members", JSON.stringify({
    members: [{ id: "a", name: "たろう" }, { id: 42 }, null, { id: "b", name: "はなこ" }],
    activeId: "b",
  }));
  expect(loadMembers(e).map((m) => m.id)).toEqual(["a", "b"]);
  expect(getActiveId(e)).toBe("b");
  // The damaged raw value is preserved and the repaired list is written back.
  expect(e.getItem("karate.members.corrupt")).toContain("たろう");
  expect(JSON.parse(e.getItem("karate.members")!).members).toHaveLength(2);
});

it("repairs an activeId that points at no member", () => {
  const e = enumStorage();
  e.setItem("karate.members", JSON.stringify({ members: [{ id: "a", name: "A" }], activeId: "zzz" }));
  expect(getActiveId(e)).toBe("a");
});

it("rebuilds members from stored m:<id>: data when the list is unparseable", () => {
  const e = enumStorage();
  e.setItem("m:kid1:karate.progress", "P1");
  e.setItem("m:kid2:karate.menu", "M2");
  e.setItem("m:kid1:karate.menu", "M1");
  e.setItem("karate.members", "{broken json");
  const members = loadMembers(e);
  expect(members).toEqual([
    { id: "kid1", name: "メンバー1" },
    { id: "kid2", name: "メンバー2" },
  ]);
  expect(getActiveId(e)).toBe("kid1");
  expect(e.getItem("m:kid1:karate.progress")).toBe("P1");   // nothing orphaned
  expect(e.getItem("karate.members.corrupt")).toBe("{broken json");
});

it("rebuilds from data when every entry is invalid", () => {
  const e = enumStorage();
  e.setItem("m:x9:karate.kufu", "K");
  e.setItem("karate.members", JSON.stringify({ members: [{ nope: true }], activeId: "q" }));
  expect(loadMembers(e)).toEqual([{ id: "x9", name: "メンバー1" }]);
});

it("falls back to a fresh default when corrupt with no member data (non-enumerable storage)", () => {
  s.setItem("karate.members", "garbage");
  const members = loadMembers(s);
  expect(members).toHaveLength(1);
  expect(members[0].name).toBe("じぶん");
  expect(s.getItem("karate.members.corrupt")).toBe("garbage");
});

it("removeMember deletes all of that member's scoped data, and only theirs", () => {
  const e = enumStorage();
  const first = loadMembers(e)[0];
  const kid = addMember("じろう", e);
  e.setItem(scopeKey(kid.id, "karate.progress"), "KP");
  e.setItem(scopeKey(kid.id, "karate.menu"), "KM");
  e.setItem(scopeKey(first.id, "karate.progress"), "FP");
  removeMember(kid.id, e);
  expect(e.getItem(scopeKey(kid.id, "karate.progress"))).toBeNull();
  expect(e.getItem(scopeKey(kid.id, "karate.menu"))).toBeNull();
  expect(e.getItem(scopeKey(first.id, "karate.progress"))).toBe("FP");
});

it("removeMember does not purge data for the protected last member or an unknown id", () => {
  const e = enumStorage();
  const first = loadMembers(e)[0];
  e.setItem(scopeKey(first.id, "karate.progress"), "FP");
  removeMember(first.id, e);
  removeMember("nobody", e);
  expect(e.getItem(scopeKey(first.id, "karate.progress"))).toBe("FP");
});

it("purgeMemberData removes only the given member's keys and tolerates non-enumerable storage", () => {
  const e = enumStorage();
  e.setItem("m:a:x", "1");
  e.setItem("m:ab:x", "2");   // prefix-similar id must survive
  e.setItem("karate.members", "{}");
  purgeMemberData("a", e);
  expect(e.getItem("m:a:x")).toBeNull();
  expect(e.getItem("m:ab:x")).toBe("2");
  expect(e.getItem("karate.members")).toBe("{}");
  expect(() => purgeMemberData("a", s)).not.toThrow();
});

it("renameMember changes a name (trimmed) and ignores empty names or unknown ids", () => {
  const taro = addMember("たろう", s);
  expect(renameMember(taro.id, "  じろう ", s)).toBe(true);
  expect(loadMembers(s).find((m) => m.id === taro.id)!.name).toBe("じろう");
  expect(renameMember(taro.id, "   ", s)).toBe(false);
  expect(renameMember("nope", "はなこ", s)).toBe(false);
  expect(loadMembers(s).find((m) => m.id === taro.id)!.name).toBe("じろう");
});
