import type { SpeechEvents } from "./speech";
import type { TurnResult, Phase } from "../shared/types/turn";
import type { startSession, postTurn, endSession, Drop, Unlock } from "./api";

const TUTOR_SPEAKER = 3;

export interface SessionDeps {
  arena: {
    loadEnemy(c: string): Promise<void>; setEnemyAction(a: string): void;
    setHero(e: string, n: string): void; heroAttack(): void; enemyDefeat(): void;
  };
  hud: {
    setHp(c: number, m: number): void; setEnemyName(n: string): void;
    setSubtitle(t: string): void; caption(w: "enemy" | "coach", t: string): void;
    damageNumber(n: number): void; journalAdd(e: string): void; toast(t: string): void;
    celebration(t: string): void; micState(s: string): void; showRetry(f: () => void): void;
  };
  audio: {
    playBgm(p: string): void; stopBgm(): void; sfx(n: string): void;
    speak(t: string, s: number): Promise<void>; interrupt(): void;
  };
  api: { startSession: typeof startSession; postTurn: typeof postTurn; endSession: typeof endSession };
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
  private silenceCount = 0;

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
    });
    if (lesson.lang === "en") this.rec.setLang("en-US");

    for (const beat of lesson.teach) {
      this.d.hud.caption("coach", beat);
      await this.d.audio.speak(beat, TUTOR_SPEAKER);
    }
    this.listen();
  }

  private listen(): void {
    this.d.hud.micState("listening");
    this.rec.start();
  }

  private async handleSilence(): Promise<void> {
    this.silenceCount += 1;
    if (this.silenceCount >= 3) {
      this.silenceCount = 0;
      this.rec.stop();
      this.d.hud.showRetry(() => {
        this.listen();
      });
      return;
    }
    await this.d.audio.speak("きこえてるよ、ゆっくりでいいからね", TUTOR_SPEAKER);
  }

  private async handleUtterance(text: string, voicedMs: number): Promise<void> {
    this.silenceCount = 0;
    this.rec.stop();
    this.d.hud.micState("thinking");
    this.d.hud.setSubtitle(text);

    let res: { turn: TurnResult; drop: Drop | null; unlocked: Unlock[] };
    try {
      res = await this.d.api.postTurn({
        childName: this.d.child.name, unitId: this.lesson.id, utterance: text,
        phase: this.phase, history: this.history, voicedMs,
      });
    } catch {
      await this.d.audio.speak("ちょっとかんがえちゅう…もういちどいってみて！", TUTOR_SPEAKER);
      this.listen();
      return;
    }

    const { turn, drop, unlocked } = res;
    this.history.push({ role: "kid", text });
    this.history.push({ role: "enemy", text: turn.enemy_line });
    this.history.push({ role: "coach", text: turn.coach_line });
    this.lastCoachLine = turn.coach_line;

    if (this.phase === "teach" && turn.phase === "battle") this.d.audio.playBgm("battle");
    this.phase = turn.phase;

    if (turn.damage > 0) {
      this.d.arena.heroAttack();
      this.d.audio.sfx("hit");
      this.hp = Math.max(0, this.hp - turn.damage);
      this.d.hud.setHp(this.hp, this.maxHp);
      this.d.hud.damageNumber(turn.damage);
    }
    this.d.arena.setEnemyAction(turn.enemy_action);

    this.d.hud.caption("coach", turn.coach_line);
    await this.d.audio.speak(turn.coach_line, TUTOR_SPEAKER);
    this.d.hud.caption("enemy", turn.enemy_line);
    await this.d.audio.speak(turn.enemy_line, this.lesson.enemy.voice);

    if (turn.deep_question) {
      this.d.hud.caption("coach", turn.deep_question);
      this.d.hud.journalAdd(turn.deep_question);
      await this.d.audio.speak(turn.deep_question, TUTOR_SPEAKER);
    }
    this.d.hud.journalAdd(text.length > 24 ? `${text.slice(0, 24)}…` : text);

    if (drop) {
      this.d.audio.sfx("unlock");
      this.d.hud.celebration(turn.coach_line);   // informational framing: what they did
    }
    for (const u of unlocked) {
      this.d.audio.sfx("fanfare");
      this.d.hud.toast(u.unlock_message);
    }

    if (turn.phase === "debrief" || turn.phase === "end") {
      this.d.audio.playBgm("victory");
      this.d.arena.enemyDefeat();
    }
    if (turn.phase === "end") {
      await this.finish();
      return;
    }
    this.listen();
  }

  private async finish(): Promise<void> {
    const { drops, unlocked } = await this.d.api.endSession({
      childName: this.d.child.name, unitId: this.lesson.id, summary: this.lastCoachLine,
    });
    for (const d of drops) {
      this.d.audio.sfx("unlock");
      this.d.hud.celebration(`きょうの ぼうけんの あかし！（+${d.xp}）`);
    }
    for (const u of unlocked) this.d.hud.toast(u.unlock_message);
    this.d.audio.stopBgm();
    this.rec.stop();
    setTimeout(() => this.d.onExit(), 3500);
  }
}
