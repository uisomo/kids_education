import type { ClaudeLike } from "./claude-turn";

export function makeMockClaude(): ClaudeLike {
  let totalDamage = 0;
  return {
    async create() {
      const finishing = totalDamage + 40 >= 100;
      const damage = finishing ? 60 : 40;
      totalDamage += damage;
      const body = finishing
        ? {
            enemy_line: "ま、まいった〜！", enemy_action: "cry",
            coach_line: "りゆうをつけて言えたね！それが交渉の力だよ",
            damage, score_reason: "used a reason", phase: "end",
            deep_question: "きょうの『りゆうをつける』、あしたどこで使えそう？",
          }
        : {
            enemy_line: "ぐぬぬ…なかなかやるな！", enemy_action: "shock",
            coach_line: "いいちょうし！つぎはあいての とくも言ってみよう",
            damage, score_reason: "good attempt", phase: "battle",
            deep_question: null,
          };
      if (finishing) totalDamage = 0; // reset so a second battle in this dev-server process works
      return { content: [{ type: "text", text: JSON.stringify(body) }] };
    },
  };
}
