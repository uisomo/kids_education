import type { ClaudeLike } from "./claude-turn";

// Scripted battle: two 40-damage exchanges, then a 60-damage finisher.
// Distinguishes the quick and followup calls by the requested output schema.
export function makeMockClaude(): ClaudeLike {
  let totalDamage = 0;
  let finishing = false;
  return {
    async create(params: Record<string, unknown>) {
      const schema = (params as {
        output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } };
      }).output_config?.format?.schema?.properties ?? {};

      let body: object;
      if ("enemy_line" in schema) {
        finishing = totalDamage + 40 >= 100;
        const damage = finishing ? 60 : 40;
        totalDamage = finishing ? 0 : totalDamage + damage;
        body = finishing
          ? { enemy_line: "ま、まいった〜！", enemy_action: "cry", damage }
          : { enemy_line: "ぐぬぬ…なかなかやるな！", enemy_action: "shock", damage };
      } else {
        body = finishing
          ? {
              coach_line: "りゆうをつけて言えたね！それが交渉の力だよ",
              score_reason: "used a reason", phase: "end",
              deep_question: "きょうの『りゆうをつける』、あしたどこで使えそう？",
            }
          : {
              coach_line: "いいちょうし！つぎはあいての とくも言ってみよう",
              score_reason: "good attempt", phase: "battle",
              deep_question: null,
            };
      }
      return { content: [{ type: "text", text: JSON.stringify(body) }] };
    },
  };
}
