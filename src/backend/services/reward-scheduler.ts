export interface Drop { xp: number; kind: "treasure" | "milestone" | "session-end" }

const MS_PER_XP = 6000;          // ~10 XP per voiced minute
const P_FULL_AT_MS = 120000;     // accrual at which base drop chance saturates
const P_MAX = 0.5;
const CARRY_CHANCE = 0.5;        // sometimes the surprise waits until next session
const CARRY_FRACTION = 0.3;

export class EngagementBank {
  private accrued: number;
  private readonly mult: number;
  private readonly rng: () => number;

  constructor(opts: { bootstrapMultiplier?: number; rng?: () => number; carriedMs?: number } = {}) {
    this.accrued = opts.carriedMs ?? 0;
    this.mult = opts.bootstrapMultiplier ?? 1;
    this.rng = opts.rng ?? Math.random;
  }

  addVoicedMs(ms: number): void {
    if (ms > 0) this.accrued += ms;
  }

  get accruedMs(): number {
    return this.accrued;
  }

  maybeDrop(): Drop | null {
    if (this.accrued < MS_PER_XP) return null;
    const p = Math.min(P_MAX, this.accrued / P_FULL_AT_MS) * this.mult;
    if (this.rng() >= p) return null;
    const xp = Math.round(this.accrued / MS_PER_XP);
    this.accrued = 0;
    return { xp, kind: "treasure" };
  }

  endOfSession(): { drops: Drop[]; carryMs: number } {
    let carryMs = 0;
    if (this.rng() < CARRY_CHANCE) carryMs = Math.round(this.accrued * CARRY_FRACTION);
    const cashMs = this.accrued - carryMs;
    this.accrued = 0;
    const xp = Math.round(cashMs / MS_PER_XP);
    return { drops: xp > 0 ? [{ xp, kind: "session-end" }] : [], carryMs };
  }
}
