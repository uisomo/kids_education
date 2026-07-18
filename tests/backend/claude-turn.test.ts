import { describe, it, expect, vi } from "vitest";
import { runQuickTurn, runFollowup, TurnServiceError } from "../../src/backend/services/claude-turn";
import { loadLesson } from "../../src/backend/services/lesson-store";
import type { ChildProfile } from "../../src/backend/services/prompt-builder";

const lesson = loadLesson("content", "negotiation", "unit-01");
const profile: ChildProfile = { name: "ゆうた", age: 8, interests: [], recentLessons: [] };
const req = { childName: "ゆうた", unitId: "unit-01", utterance: "やすくして！", phase: "battle" as const, history: [] };
const followupReq = {
  ...req,
  history: [
    { role: "kid" as const, text: "やすくして！" },
    { role: "enemy" as const, text: "だめだね！" },
  ],
  enemyLine: "だめだね！", damage: 10, remainingHp: 90, maxHp: 100,
};

const quickJson = JSON.stringify({ enemy_line: "だめだね！", enemy_action: "laugh", damage: 10 });
const followupJson = JSON.stringify({
  coach_line: "りゆうをつけてみよう", score_reason: "no reason given",
  phase: "battle", deep_question: null,
});
const okQuick = { content: [{ type: "text", text: quickJson }] };
const okFollowup = { content: [{ type: "text", text: followupJson }] };

describe("runQuickTurn", () => {
  it("returns parsed QuickTurnResult and passes model + system blocks", async () => {
    const create = vi.fn().mockResolvedValue(okQuick);
    const t = await runQuickTurn({ create }, "claude-haiku-4-5", lesson, profile, req);
    expect(t.damage).toBe(10);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(Array.isArray(params.system)).toBe(true);
    expect(params.output_config.format.schema.properties).toHaveProperty("enemy_line");
  });
  it("retries once on API error", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(okQuick);
    const t = await runQuickTurn({ create }, "m", lesson, profile, req);
    expect(t.enemy_action).toBe("laugh");
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("re-asks once on malformed JSON, then throws TurnServiceError", async () => {
    const bad = { content: [{ type: "text", text: "garbage" }] };
    const create = vi.fn().mockResolvedValue(bad);
    await expect(runQuickTurn({ create }, "m", lesson, profile, req)).rejects.toThrow(TurnServiceError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("runFollowup", () => {
  it("returns parsed FollowupResult and tells the model the battle state", async () => {
    const create = vi.fn().mockResolvedValue(okFollowup);
    const t = await runFollowup({ create }, "m", lesson, profile, followupReq);
    expect(t.coach_line).toBe("りゆうをつけてみよう");
    const params = create.mock.calls[0][0];
    expect(params.output_config.format.schema.properties).toHaveProperty("coach_line");
    const last = params.messages[params.messages.length - 1];
    expect(last.content).toContain("90/100");
  });
});
