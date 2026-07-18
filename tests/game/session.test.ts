// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SessionController } from "../../src/game/session";
import type { SpeechEvents } from "../../src/game/speech";

function makeDeps(turnQueue: object[]) {
  let speechEvents: SpeechEvents | null = null;
  const deps = {
    arena: {
      loadEnemy: vi.fn().mockResolvedValue(undefined), setEnemyAction: vi.fn(),
      setHero: vi.fn(), heroAttack: vi.fn(), enemyDefeat: vi.fn(),
    },
    hud: {
      setHp: vi.fn(), setEnemyName: vi.fn(), setSubtitle: vi.fn(), caption: vi.fn(),
      damageNumber: vi.fn(), journalAdd: vi.fn(), toast: vi.fn(), celebration: vi.fn(),
      micState: vi.fn(), showRetry: vi.fn(),
    },
    audio: {
      playBgm: vi.fn(), stopBgm: vi.fn(), sfx: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined), interrupt: vi.fn(),
    },
    api: {
      startSession: vi.fn().mockResolvedValue({
        lesson: {
          id: "unit-01", subject: "negotiation", title: "T",
          teach: ["beat1"], check_questions: [],
          enemy: { name: "ゴルド", persona: "p", voice: 13, sprite: "yellow", hp: 100, win_criteria: "w" },
          reward: { stat: "charisma", xp: 50 }, lang: "ja",
        },
        profile: { name: "yuta", age: 8, interests: [], recentLessons: [] },
        carriedMs: 0,
      }),
      postTurn: vi.fn().mockImplementation(() => Promise.resolve(turnQueue.shift())),
      endSession: vi.fn().mockResolvedValue({ drops: [], unlocked: [] }),
    },
    child: { name: "yuta", avatar: "🦊" },
    makeRec: (ev: SpeechEvents) => {
      speechEvents = ev;
      return { start: vi.fn(), stop: vi.fn(), setLang: vi.fn() };
    },
    onExit: vi.fn(),
  };
  return { deps, say: (t: string) => speechEvents!.onFinal(t, 2000) };
}

const battleTurn = {
  turn: { enemy_line: "ぐぬ", enemy_action: "shock", coach_line: "いいね",
          damage: 40, score_reason: "r", phase: "battle", deep_question: null },
  drop: null, unlocked: [],
};
const endTurn = {
  turn: { enemy_line: "まいった！", enemy_action: "cry", coach_line: "りゆうが言えたね",
          damage: 60, score_reason: "r", phase: "end", deep_question: "あしたどう使う？" },
  drop: { xp: 8, kind: "treasure" }, unlocked: [{ japanese_name: "バッジ", unlock_message: "バッジを手に入れた！" }],
};

describe("SessionController", () => {
  it("runs teach intro then processes a battle turn", async () => {
    const { deps, say } = makeDeps([structuredClone(battleTurn)]);
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    expect(deps.audio.speak).toHaveBeenCalled();          // teach beat spoken
    expect(deps.arena.setHero).toHaveBeenCalledWith("🦊", "yuta");
    say("やすくして");
    await vi.waitFor(() => expect(deps.api.postTurn).toHaveBeenCalled());
    await vi.waitFor(() => expect(deps.hud.setHp).toHaveBeenCalledWith(60, 100));
    expect(deps.arena.heroAttack).toHaveBeenCalled();
    expect(deps.arena.setEnemyAction).toHaveBeenCalledWith("shock");
  });

  it("on phase end: defeat animation, celebration for drop+unlock, session end", async () => {
    const { deps, say } = makeDeps([structuredClone(endTurn)]);
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    say("おてつだいするから、やすくして");
    await vi.waitFor(() => expect(deps.api.endSession).toHaveBeenCalled());
    expect(deps.arena.enemyDefeat).toHaveBeenCalled();
    expect(deps.hud.celebration).toHaveBeenCalled();      // surprise drop revealed
    expect(deps.hud.toast).toHaveBeenCalledWith("バッジを手に入れた！");
    expect(deps.hud.journalAdd).toHaveBeenCalled();       // deep question journaled
  });

  it("tutor apologises and keeps listening when postTurn fails", async () => {
    const { deps, say } = makeDeps([]);
    (deps.api.postTurn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("502"));
    const s = new SessionController(deps as never);
    await s.start("negotiation", "unit-01");
    say("あ");
    await vi.waitFor(() =>
      expect(deps.audio.speak).toHaveBeenCalledWith(expect.stringContaining("かんがえちゅう"), expect.anything()),
    );
  });
});
