import type { SpeechEvents } from "./speech";
import type { QuickTurnResult, Phase } from "../shared/types/turn";
import type { startSession, postQuickTurn, postFollowup, endSession } from "./api";
import { TUTOR_SPEAKER } from "./audio";

// Instant reactions played the moment the kid finishes talking, while Claude
// thinks — the pause reads as "the character heard me" instead of dead air.
const ENEMY_AIZUCHI = ["むむっ…！", "ほほう…？", "なんだと…", "むむむ…"];
const TUTOR_AIZUCHI = ["ふんふん…", "なるほど…", "うんうん…"];

export interface SessionDeps {
  arena: {
    loadEnemy(c: string): Promise<void>; setEnemyAction(a: string): void;
    setHero(e: string, n: string): void; heroAttack(): void; enemyDefeat(): void;
  };
  hud: {
    setHp(c: number, m: number): void; setEnemyName(n: string): void;
    setSubtitle(t: string): void; caption(w: "enemy" | "coach" | "kid", t: string): void;
    damageNumber(n: number): void; journalAdd(e: string): void; toast(t: string): void;
    celebration(t: string): void; micState(s: string): void; showRetry(f: () => void): void;
  };
  audio: {
    playBgm(p: string): void; stopBgm(): void; sfx(n: string): void;
    speak(t: string, s: number): Promise<void>; interrupt(): void;
    prefetch(t: string, s: number): void;
  };
  api: {
    startSession: typeof startSession; postQuickTurn: typeof postQuickTurn;
    postFollowup: typeof postFollowup; endSession: typeof endSession;
  };
  child: { name: string; avatar: string };
  makeRec(events: SpeechEvents): { start(): void; stop(): void; setLang(l: "ja-JP" | "en-US"): void };
  onExit(): void;
}

export class SessionController {
  private phase: Phase = "teach";
  private hp = 100;
  private maxHp = 100;
  private history: { role: "kid" | "enemy" | "coach"; text: string }[] = [];
  private lesson!: Awaited<ReturnType<typeof startSession>>["lesson"];
  private rec!: ReturnType<SessionDeps["makeRec"]>;
  private lastCoachLine = "";
  private lastQuestion = "";
  private silenceCount = 0;
  private aizuchiIdx = 0;

  constructor(private d: SessionDeps) {}

  async start(subject: string, unitId: string): Promise<void> {
    const { lesson } = await this.d.api.startSession(this.d.child.name, subject, unitId);
    this.lesson = lesson;
    this.maxHp = this.hp = lesson.enemy.hp;

    this.d.arena.setHero(this.d.child.avatar, this.d.child.name);
    await this.d.arena.loadEnemy(lesson.enemy.sprite);
    this.d.hud.setEnemyName(lesson.enemy.name);
    this.d.hud.setHp(this.hp, this.maxHp);
    this.d.audio.playBgm("teach");

    this.rec = this.d.makeRec({
      onInterim: (t) => { this.d.audio.interrupt(); this.d.hud.setSubtitle(t); },
      onFinal: (t, ms) => void this.handleUtterance(t, ms),
      onSilence: () => void this.handleSilence(),
      onMicError: () => {
        this.d.hud.toast("マイクがつかえないみたい。ブラウザのマイクせっていをみてね");
        this.d.hud.showRetry(() => this.listen());
      },
    });
    if (lesson.lang === "en") this.rec.setLang("en-US");

    const opener = lesson.check_questions[0];
    for (const beat of lesson.teach) this.d.audio.prefetch(beat, TUTOR_SPEAKER);
    if (opener) this.d.audio.prefetch(opener, TUTOR_SPEAKER);
    for (const a of TUTOR_AIZUCHI) this.d.audio.prefetch(a, TUTOR_SPEAKER);
    for (const a of ENEMY_AIZUCHI) this.d.audio.prefetch(a, lesson.enemy.voice);
    for (const beat of lesson.teach) {
      this.d.hud.caption("coach", beat);
      await this.d.audio.speak(beat, TUTOR_SPEAKER);
    }
    // Always pose a concrete question before opening the mic, so the kid knows
    // what to answer instead of facing dead air. The model sees it in history.
    if (opener) {
      this.lastQuestion = opener;
      this.history.push({ role: "coach", text: opener });
      this.d.hud.caption("coach", opener);
      await this.d.audio.speak(opener, TUTOR_SPEAKER);
    }
    this.listen();
  }

  // On a transient turn failure, re-pose the last real question instead of a
  // bare "say it again" — a stuck kid needs to hear what to answer, not a nudge.
  private async recover(): Promise<void> {
    const line = this.lastQuestion
      ? `いま ちょっと きこえなかったよ。${this.lastQuestion}`
      : "いま ちょっと きこえなかったよ。もういちど、ゆっくり おしえてくれる？";
    await this.d.audio.speak(line, TUTOR_SPEAKER);
    this.listen();
  }

  private listen(): void {
    this.d.hud.micState("listening");
    this.rec.start();
  }

  private async handleSilence(): Promise<void> {
    // Never switch the mic off: kids need thinking time. Nudge twice, then wait quietly.
    this.silenceCount += 1;
    if (this.silenceCount > 2) return;
    await this.d.audio.speak("きこえてるよ、ゆっくりでいいからね", TUTOR_SPEAKER);
  }

  private async handleUtterance(text: string, voicedMs: number): Promise<void> {
    this.silenceCount = 0;
    this.rec.stop();
    this.d.hud.micState("thinking");
    this.d.hud.setSubtitle(text);
    this.d.hud.caption("kid", text);

    // Instant grunt while Claude thinks (fire-and-forget; the real line interrupts it).
    const teach = this.phase === "teach";
    const pool = teach ? TUTOR_AIZUCHI : ENEMY_AIZUCHI;
    const aizuchiVoice = teach ? TUTOR_SPEAKER : this.lesson.enemy.voice;
    const aizuchi = pool[this.aizuchiIdx++ % pool.length];
    void this.d.audio.speak(aizuchi, aizuchiVoice);
    this.d.audio.prefetch(aizuchi, aizuchiVoice); // refill for a later turn

    let quick: QuickTurnResult;
    try {
      quick = (await this.d.api.postQuickTurn({
        childName: this.d.child.name, unitId: this.lesson.id, utterance: text,
        phase: this.phase, history: this.history,
      })).turn;
    } catch {
      await this.recover();
      return;
    }

    this.d.audio.prefetch(quick.enemy_line, this.lesson.enemy.voice);
    this.history.push({ role: "kid", text });
    this.history.push({ role: "enemy", text: quick.enemy_line });

    if (quick.damage > 0) {
      this.d.arena.heroAttack();
      this.d.audio.sfx("hit");
      this.hp = Math.max(0, this.hp - quick.damage);
      this.d.hud.setHp(this.hp, this.maxHp);
      this.d.hud.damageNumber(quick.damage);
    }
    this.d.arena.setEnemyAction(quick.enemy_action);

    // Coaching/scoring is fetched while the enemy line is being voiced.
    const followP = this.d.api.postFollowup({
      childName: this.d.child.name, unitId: this.lesson.id, utterance: text,
      phase: this.phase, history: this.history,
      enemyLine: quick.enemy_line, damage: quick.damage,
      remainingHp: this.hp, maxHp: this.maxHp, voicedMs,
    }).then((r) => {
      this.d.audio.prefetch(r.turn.coach_line, TUTOR_SPEAKER);
      if (r.turn.deep_question) this.d.audio.prefetch(r.turn.deep_question, TUTOR_SPEAKER);
      return r;
    });
    followP.catch(() => { /* handled after the enemy line */ });

    this.d.hud.caption("enemy", quick.enemy_line);
    await this.d.audio.speak(quick.enemy_line, this.lesson.enemy.voice);

    let res: Awaited<ReturnType<typeof postFollowup>>;
    try {
      res = await followP;
    } catch {
      await this.recover();
      return;
    }

    const { turn: follow, drop, unlocked } = res;
    this.history.push({ role: "coach", text: follow.coach_line });
    this.lastCoachLine = follow.coach_line;

    if (this.phase === "teach" && follow.phase === "battle") this.d.audio.playBgm("battle");
    const prevPhase = this.phase;
    this.phase = follow.phase;

    this.d.hud.caption("coach", follow.coach_line);
    await this.d.audio.speak(follow.coach_line, TUTOR_SPEAKER);

    if (follow.deep_question) {
      this.lastQuestion = follow.deep_question;
      this.d.hud.caption("coach", follow.deep_question);
      this.d.hud.journalAdd(follow.deep_question);
      await this.d.audio.speak(follow.deep_question, TUTOR_SPEAKER);
    }
    this.d.hud.journalAdd(text.length > 24 ? `${text.slice(0, 24)}…` : text);

    if (drop) {
      this.d.audio.sfx("unlock");
      this.d.hud.celebration(follow.coach_line);   // informational framing: what they did
    }
    for (const u of unlocked) {
      this.d.audio.sfx("fanfare");
      this.d.hud.toast(u.unlock_message);
    }

    if (
      (follow.phase === "debrief" || follow.phase === "end") &&
      prevPhase !== "debrief" &&
      prevPhase !== "end"
    ) {
      this.d.audio.playBgm("victory");
      this.d.arena.enemyDefeat();
      this.d.hud.setHp(0, this.maxHp);
    }
    if (follow.phase === "end") {
      await this.finish();
      return;
    }
    this.listen();
  }

  private async finish(): Promise<void> {
    try {
      const { drops, unlocked } = await this.d.api.endSession({
        childName: this.d.child.name, unitId: this.lesson.id, summary: this.lastCoachLine,
      });
      for (const d of drops) {
        this.d.audio.sfx("unlock");
        this.d.hud.celebration("きょうも こえに だして かんがえられたね！たからばこ はっけん！");
      }
      for (const u of unlocked) {
        this.d.audio.sfx("fanfare");
        this.d.hud.toast(u.unlock_message);
      }
    } catch {
      this.d.hud.toast("きろくで つまずいたけど、きょうの ぼうけんは バッチリ！");
    } finally {
      this.d.audio.stopBgm();
      this.rec.stop();
      setTimeout(() => this.d.onExit(), 3500);
    }
  }
}
