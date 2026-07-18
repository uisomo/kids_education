import { describe, it, expect, vi } from "vitest";
import { runTurn, TurnServiceError, type ClaudeLike } from "../../src/backend/services/claude-turn";
import { loadLesson } from "../../src/backend/services/lesson-store";
import type { ChildProfile } from "../../src/backend/services/prompt-builder";

const lesson = loadLesson("content", "negotiation", "unit-01");
const profile: ChildProfile = { name: "ゆうた", age: 8, interests: [], recentLessons: [] };
const req = { childName: "ゆうた", unitId: "unit-01", utterance: "やすくして！", phase: "battle" as const, history: [] };

const goodJson = JSON.stringify({
  enemy_line: "だめだね！", enemy_action: "laugh", coach_line: "りゆうをつけてみよう",
  damage: 10, score_reason: "no reason given", phase: "battle", deep_question: null,
});
const ok = { content: [{ type: "text", text: goodJson }] };

describe("runTurn", () => {
  it("returns parsed TurnResult and passes model + system blocks", async () => {
    const create = vi.fn().mockResolvedValue(ok);
    const t = await runTurn({ create }, "claude-haiku-4-5", lesson, profile, req);
    expect(t.damage).toBe(10);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(Array.isArray(params.system)).toBe(true);
  });
  it("retries once on API error", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(ok);
    const t = await runTurn({ create }, "m", lesson, profile, req);
    expect(t.enemy_action).toBe("laugh");
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("re-asks once on malformed JSON, then throws TurnServiceError", async () => {
    const bad = { content: [{ type: "text", text: "garbage" }] };
    const create = vi.fn().mockResolvedValue(bad);
    await expect(runTurn({ create }, "m", lesson, profile, req)).rejects.toThrow(TurnServiceError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
