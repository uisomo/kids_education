import { describe, it, expect } from "vitest";
import { parseTurnResult, TurnParseError } from "../../src/shared/types/turn";

const good = JSON.stringify({
  enemy_line: "むむ、なかなか言うな…", enemy_action: "shock",
  coach_line: "理由を言えたね！", damage: 40,
  score_reason: "gave a reason", phase: "battle", deep_question: null,
});

describe("parseTurnResult", () => {
  it("parses a valid turn", () => {
    const t = parseTurnResult(good);
    expect(t.damage).toBe(40);
    expect(t.enemy_action).toBe("shock");
  });
  it("clamps damage into 0..100", () => {
    const t = parseTurnResult(good.replace('"damage":40', '"damage":150'));
    expect(t.damage).toBe(100);
  });
  it("throws TurnParseError on bad action", () => {
    expect(() =>
      parseTurnResult(good.replace('"shock"', '"explode"')),
    ).toThrow(TurnParseError);
  });
  it("throws TurnParseError on non-JSON", () => {
    expect(() => parseTurnResult("not json")).toThrow(TurnParseError);
  });
  it("throws TurnParseError on unknown key", () => {
    expect(() =>
      parseTurnResult(good.replace("}", ', "foo": 1}')),
    ).toThrow(TurnParseError);
  });
  it("rounds damage to integer", () => {
    const t = parseTurnResult(good.replace('"damage":40', '"damage":40.6'));
    expect(t.damage).toBe(41);
  });
});
