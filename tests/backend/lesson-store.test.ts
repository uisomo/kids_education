import { describe, it, expect } from "vitest";
import { loadLesson, listLessons } from "../../src/backend/services/lesson-store";

describe("lesson-store", () => {
  it("lists 3 negotiation units", () => {
    const l = listLessons("content", "negotiation");
    expect(l.map((x) => x.id)).toEqual(["unit-01", "unit-02", "unit-03"]);
  });
  it("loads a unit with enemy + reward", () => {
    const u = loadLesson("content", "negotiation", "unit-01");
    expect(u.enemy.hp).toBe(100);
    expect(u.reward.stat).toBe("charisma");
    expect(u.teach.length).toBeGreaterThan(0);
  });
  it("throws on unknown unit", () => {
    expect(() => loadLesson("content", "negotiation", "unit-99")).toThrow();
  });
});
