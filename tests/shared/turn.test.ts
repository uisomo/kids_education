import { describe, it, expect } from "vitest";
import { parseQuickTurn, parseFollowup, TurnParseError } from "../../src/shared/types/turn";

const goodQuick = JSON.stringify({
  enemy_line: "むむ、なかなか言うな…", enemy_action: "shock", damage: 40,
});
const goodFollowup = JSON.stringify({
  coach_line: "理由を言えたね！", score_reason: "gave a reason",
  phase: "battle", deep_question: null,
});

describe("parseQuickTurn", () => {
  it("parses a valid quick turn", () => {
    const t = parseQuickTurn(goodQuick);
    expect(t.damage).toBe(40);
    expect(t.enemy_action).toBe("shock");
  });
  it("clamps damage into 0..100", () => {
    const t = parseQuickTurn(goodQuick.replace('"damage":40', '"damage":150'));
    expect(t.damage).toBe(100);
  });
  it("rounds damage to integer", () => {
    const t = parseQuickTurn(goodQuick.replace('"damage":40', '"damage":40.6'));
    expect(t.damage).toBe(41);
  });
  it("throws TurnParseError on bad action", () => {
    expect(() =>
      parseQuickTurn(goodQuick.replace('"shock"', '"explode"')),
    ).toThrow(TurnParseError);
  });
  it("throws TurnParseError on non-JSON", () => {
    expect(() => parseQuickTurn("not json")).toThrow(TurnParseError);
  });
  it("throws TurnParseError on unknown key", () => {
    expect(() =>
      parseQuickTurn(goodQuick.replace("}", ', "foo": 1}')),
    ).toThrow(TurnParseError);
  });
});

describe("parseFollowup", () => {
  it("parses a valid followup", () => {
    const t = parseFollowup(goodFollowup);
    expect(t.phase).toBe("battle");
    expect(t.deep_question).toBeNull();
  });
  it("throws TurnParseError on bad phase", () => {
    expect(() =>
      parseFollowup(goodFollowup.replace('"battle"', '"intermission"')),
    ).toThrow(TurnParseError);
  });
  it("throws TurnParseError when quick fields leak in", () => {
    expect(() =>
      parseFollowup(goodFollowup.replace("}", ', "enemy_line": "x"}')),
    ).toThrow(TurnParseError);
  });
});
