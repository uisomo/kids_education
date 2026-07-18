import { describe, it, expect } from "vitest";
import { EngagementBank } from "../../src/backend/services/reward-scheduler";

describe("EngagementBank", () => {
  it("accrues voiced ms and never forfeits", () => {
    const b = new EngagementBank({ rng: () => 0.99 }); // rng high → never drops
    b.addVoicedMs(5000);
    b.addVoicedMs(7000);
    expect(b.accruedMs).toBe(12000);
    expect(b.maybeDrop()).toBeNull();
    expect(b.accruedMs).toBe(12000); // no-drop consumes nothing
  });
  it("drops when rng is low, converting accrual to xp (~10xp/min)", () => {
    const b = new EngagementBank({ rng: () => 0.0 });
    b.addVoicedMs(60000); // 1 minute voiced
    const d = b.maybeDrop();
    expect(d).not.toBeNull();
    expect(d!.xp).toBe(10);
    expect(b.accruedMs).toBe(0);
  });
  it("no accrual → no drop even with lucky rng", () => {
    const b = new EngagementBank({ rng: () => 0.0 });
    expect(b.maybeDrop()).toBeNull();
  });
  it("bootstrapMultiplier raises drop chance", () => {
    // p = min(0.5, accrual/120000) * mult ; accrual 30000 → base p 0.25; mult 2 → 0.5
    const bBase = new EngagementBank({ rng: () => 0.3 });
    bBase.addVoicedMs(30000);
    expect(bBase.maybeDrop()).toBeNull(); // 0.3 >= 0.25 → no drop
    const bBoost = new EngagementBank({ rng: () => 0.3, bootstrapMultiplier: 2 });
    bBoost.addVoicedMs(30000);
    expect(bBoost.maybeDrop()).not.toBeNull(); // 0.3 < 0.5 → drop
  });
  it("endOfSession cashes out and may carry remainder", () => {
    const b = new EngagementBank({ rng: () => 0.4 }); // 0.4 < 0.5 → carries
    b.addVoicedMs(90000);
    const { drops, carryMs } = b.endOfSession();
    expect(carryMs).toBeGreaterThan(0);
    expect(drops.reduce((s, d) => s + d.xp, 0)).toBe(Math.round((90000 - carryMs) / 6000));
    expect(b.accruedMs).toBe(0);
  });
});
