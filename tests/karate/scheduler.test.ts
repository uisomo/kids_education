import { describe, it, expect, vi } from "vitest";
import { SessionScheduler } from "../../karate-trainer/src/scheduler";
import type { Menu } from "../../karate-trainer/src/types";

function handlers() {
  return {
    onDrillStart: vi.fn(), onTick: vi.fn(), onEncourage: vi.fn(),
    onCountdown: vi.fn(), onDrillEnd: vi.fn(), onSessionEnd: vi.fn(),
  };
}
const menu: Menu = [
  { id: "a", name: "前蹴り", seconds: 5, kind: "drill" },
  { id: "b", name: "休憩", seconds: 3, kind: "rest" },
];

function pump(s: SessionScheduler, ms: number, step = 250) {
  for (let t = 0; t < ms; t += step) s.tick(step);
}

describe("SessionScheduler", () => {
  it("announces the first drill on start", () => {
    const h = handlers();
    new SessionScheduler(menu, h).start();
    expect(h.onDrillStart).toHaveBeenCalledWith(menu[0], 0, 2);
  });

  it("fires a 3-2-1 countdown in the final three seconds", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 5000);
    expect(h.onCountdown.mock.calls.map((c) => c[0])).toEqual([3, 2, 1]);
  });

  it("advances to the next drill and ends the session", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 5000);
    expect(h.onDrillStart).toHaveBeenCalledWith(menu[1], 1, 2);
    pump(s, 3000);
    expect(h.onSessionEnd).toHaveBeenCalledOnce();
  });

  it("never encourages during a rest drill", () => {
    const h = handlers();
    // tiny interval so it WOULD fire every 250ms if allowed
    const s = new SessionScheduler(menu, h, { encourageEveryMs: 250, jitterMs: 0, rng: () => 0.5 });
    s.start();
    pump(s, 5000);      // drill 1 done
    h.onEncourage.mockClear();
    pump(s, 3000);      // the rest drill
    expect(h.onEncourage).not.toHaveBeenCalled();
  });

  it("pause freezes the countdown", () => {
    const h = handlers();
    const s = new SessionScheduler(menu, h);
    s.start();
    pump(s, 2000);
    s.pause();
    h.onTick.mockClear();
    pump(s, 2000);
    expect(h.onTick).not.toHaveBeenCalled();
  });
});
