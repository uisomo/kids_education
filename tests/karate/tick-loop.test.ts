import { describe, it, expect, vi, afterEach } from "vitest";
import { makeTickLoop, MAX_DELTA_MS } from "../../karate-trainer/src/tick-loop";

// The drill countdown froze on the phone (アランのピアノ, 2026-09-21): the REC
// counter kept running while 「30」 never moved, because iOS stopped delivering
// requestAnimationFrame mid-practice and the rAF chain re-scheduled itself from
// inside its own callback. These pin the two properties that fixes it.
describe("tick loop", () => {
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    vi.useFakeTimers();
    let clock = 1000;
    const loop = makeTickLoop({ now: () => clock, tickMs: 200 });
    // Move the fake clock in small steps alongside the fake timers, so a tick
    // that fires mid-way reads the time it would really have fired at.
    const advance = (ms: number) => {
      for (let left = ms; left > 0; left -= 50) {
        const step = Math.min(50, left);
        clock += step;
        vi.advanceTimersByTime(step);
      }
    };
    return { loop, advance };
  };

  it("reports the milliseconds that really elapsed", () => {
    const { loop, advance } = setup();
    const deltas: number[] = [];
    loop.start((d) => deltas.push(d));
    advance(600);
    expect(deltas).toEqual([200, 200, 200]);
    loop.stop();
  });

  it("keeps ticking after a callback throws", () => {
    const { loop, advance } = setup();
    let ticks = 0;
    loop.start(() => { ticks++; if (ticks === 1) throw new Error("boom"); });
    advance(600);
    expect(ticks).toBe(3);
    loop.stop();
  });

  it("caps the delta so a throttled/resumed timer can't jump the drill", () => {
    const { loop, advance } = setup();
    const deltas: number[] = [];
    loop.start((d) => deltas.push(d));
    advance(60_000);   // the app was in the background
    expect(Math.max(...deltas)).toBeLessThanOrEqual(MAX_DELTA_MS);
    loop.stop();
  });

  it("stops, and a second start does not leave the first loop running", () => {
    const { loop, advance } = setup();
    let ticks = 0;
    loop.start(() => ticks++);
    loop.start(() => ticks++);
    advance(400);
    expect(ticks).toBe(2);
    loop.stop();
    advance(400);
    expect(ticks).toBe(2);
  });
});
