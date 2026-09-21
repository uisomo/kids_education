import type { RafLoop } from "./app";

// The loop that advances a practice: every tick it hands the scheduler the
// milliseconds that really elapsed, until stop().
//
// This was a requestAnimationFrame chain, and on the phone iOS simply stopped
// delivering rAF during a practice: the REC counter — a plain setInterval —
// kept counting while the drill's 「30」 never moved once, so the session could
// never end by itself (seen in アランのピアノ on 2026-09-21). A rAF chain is
// fragile a second way too: it re-schedules itself from inside its own
// callback, so one throw in there kills the countdown for the whole practice.
// setInterval runs on the scheduling path REC already proves keeps going, and
// a throw costs a single tick.
//
// 200ms is plenty — the only things watching are a whole-second countdown and
// the encouragement timer.
export const TICK_MS = 200;

// The delta is measured off the clock rather than assumed to be TICK_MS, and
// capped: iOS throttles timers in the background and resumes with one huge
// gap, which would jump the drill timer. The session pauses itself when
// hidden, so dropping that time is correct.
export const MAX_DELTA_MS = 1000;

export interface TickLoopDeps {
  now?: () => number;
  tickMs?: number;
}

export function makeTickLoop(deps: TickLoopDeps = {}): RafLoop {
  const now = deps.now ?? (() => performance.now());
  const tickMs = deps.tickMs ?? TICK_MS;
  let handle: ReturnType<typeof setInterval> | null = null;
  let last = 0;

  const stop = () => {
    if (handle !== null) { clearInterval(handle); handle = null; }
  };

  return {
    start(cb: (deltaMs: number) => void) {
      stop();   // a second 練習 must not leave the previous loop running
      last = now();
      handle = setInterval(() => {
        const t = now();
        const deltaMs = Math.min(MAX_DELTA_MS, Math.max(0, t - last));
        last = t;
        // One bad tick must not take the countdown down with it — the whole
        // point of moving off the self-rescheduling rAF chain.
        try {
          cb(deltaMs);
        } catch {
          /* keep ticking */
        }
      }, tickMs);
    },
    stop,
  };
}
