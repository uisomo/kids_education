import { describe, it, expect } from "vitest";
import { buildSystemBlocks, buildMessages, type ChildProfile } from "../../src/backend/services/prompt-builder";
import { loadLesson } from "../../src/backend/services/lesson-store";

const profile: ChildProfile = {
  name: "ゆうた", age: 8, interests: ["サッカー"],
  recentLessons: [{ unitId: "unit-01", title: "お金のきほん", summary: "おかねは交換のどうぐだと学んだ", date: "2026-07-17" }],
};

describe("buildSystemBlocks", () => {
  const lesson = loadLesson("content", "negotiation", "unit-01");
  const blocks = buildSystemBlocks(lesson, profile);

  it("has 3 blocks: core, lesson (cached), profile", () => {
    expect(blocks).toHaveLength(3);
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[2].cache_control).toBeUndefined();
  });
  it("stable prefix is at least 16000 chars (≈4096 tokens for Haiku caching)", () => {
    expect(blocks[0].text.length + blocks[1].text.length).toBeGreaterThanOrEqual(16000);
  });
  it("core contains safety + deep-question rules; profile block has child data", () => {
    expect(blocks[0].text).toContain("6さい〜12さい");
    expect(blocks[0].text).toMatch(/deep question|ふかい質問/i);
    expect(blocks[2].text).toContain("ゆうた");
    expect(blocks[2].text).toContain("お金のきほん");
  });
  it("core forbids wage-style reward talk", () => {
    expect(blocks[0].text).toContain("ごほうび");
  });
});

describe("buildMessages", () => {
  it("maps kid→user, enemy/coach→assistant and trims to 10 exchanges", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "kid" : "enemy") as "kid" | "enemy",
      text: `t${i}`,
    }));
    const msgs = buildMessages({
      childName: "ゆうた", unitId: "unit-01", utterance: "やすくして！",
      phase: "battle", history,
    });
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "やすくして！" });
    expect(msgs.length).toBeLessThanOrEqual(21);
    expect(msgs[0].role).toBe("user");
  });
});
