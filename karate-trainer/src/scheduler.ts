import type { Menu, Drill } from "./types";

export interface SchedulerHandlers {
  onDrillStart(drill: Drill, index: number, total: number): void;
  onTick(secondsLeft: number): void;
  onEncourage(): void;
  onCountdown(n: number): void;
  onDrillEnd(drill: Drill): void;
  onSessionEnd(): void;
}
export interface SchedulerOpts {
  encourageEveryMs?: number;
  jitterMs?: number;
  rng?: () => number;
}

export class SessionScheduler {
  private idx = -1;
  private remainingMs = 0;
  private lastWholeSecond = -1;
  private nextEncourageMs = 0;
  private paused = false;
  private done = false;
  private readonly everyMs: number;
  private readonly jitterMs: number;
  private readonly rng: () => number;

  constructor(private menu: Menu, private h: SchedulerHandlers, opts: SchedulerOpts = {}) {
    this.everyMs = opts.encourageEveryMs ?? 8500;
    this.jitterMs = opts.jitterMs ?? 2000;
    this.rng = opts.rng ?? Math.random;
  }

  start(): void { this.enter(0); }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  stop(): void { this.done = true; }
  skip(): void { if (!this.done) this.finishDrill(); }

  private scheduleEncourage(): void {
    this.nextEncourageMs = this.everyMs + (this.rng() * 2 - 1) * this.jitterMs;
  }

  private enter(i: number): void {
    if (i >= this.menu.length) { this.done = true; this.h.onSessionEnd(); return; }
    this.idx = i;
    const drill = this.menu[i];
    this.remainingMs = drill.seconds * 1000;
    this.lastWholeSecond = drill.seconds;
    this.scheduleEncourage();
    this.h.onDrillStart(drill, i, this.menu.length);
    this.h.onTick(drill.seconds);
  }

  private finishDrill(): void {
    const drill = this.menu[this.idx];
    this.h.onDrillEnd(drill);
    this.enter(this.idx + 1);
  }

  tick(deltaMs: number): void {
    if (this.done || this.paused || this.idx < 0) return;
    const drill = this.menu[this.idx];
    this.remainingMs -= deltaMs;

    const secondsLeft = Math.max(0, Math.ceil(this.remainingMs / 1000));
    if (secondsLeft !== this.lastWholeSecond) {
      this.lastWholeSecond = secondsLeft;
      if (secondsLeft > 0) this.h.onTick(secondsLeft);
      if (secondsLeft >= 1 && secondsLeft <= 3) this.h.onCountdown(secondsLeft);
    }

    // encouragement: not in final-3s window, not on rests
    const inCountdownWindow = this.remainingMs <= 3000;
    if (drill.kind !== "rest" && !inCountdownWindow) {
      this.nextEncourageMs -= deltaMs;
      if (this.nextEncourageMs <= 0) {
        this.h.onEncourage();
        this.scheduleEncourage();
      }
    }

    if (this.remainingMs <= 0) this.finishDrill();
  }
}
