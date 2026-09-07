// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { DiagnosticsLog } from "../../karate-trainer/src/diagnostics-log";

function fakeTrack(kind: string, label = "") {
  const listeners: Record<string, ((e?: Event) => void)[]> = {};
  return {
    kind,
    label,
    id: `${kind}-id`,
    addEventListener: (type: string, cb: (e?: Event) => void) => {
      (listeners[type] ??= []).push(cb);
    },
    removeEventListener: vi.fn(),
    fire: (type: string) => listeners[type]?.forEach((cb) => cb()),
  };
}

it("timestamps log() calls relative to start()", () => {
  let t = 1000;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  t = 1500;
  log.log("hello");
  t = 2200;
  log.log("world");
  expect(log.stop()).toEqual([
    { tMs: 500, label: "hello" },
    { tMs: 1200, label: "world" },
  ]);
});

it("logs a track mute/unmute/ended events with the track kind and label", () => {
  let t = 1000;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  const videoTrack = fakeTrack("video", "camera1");
  const stream = { getTracks: () => [videoTrack] } as unknown as MediaStream;
  log.watchStream(stream);

  t = 1500;
  videoTrack.fire("mute");
  t = 1800;
  videoTrack.fire("unmute");
  t = 2000;
  videoTrack.fire("ended");

  const entries = log.stop();
  expect(entries).toEqual([
    { tMs: 500, label: "track mute: video:camera1" },
    { tMs: 800, label: "track unmute: video:camera1" },
    { tMs: 1000, label: "track ended: video:camera1" },
  ]);
});

it("noteRafTick logs a stall only when the gap exceeds the threshold", () => {
  let t = 0;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();

  log.noteRafTick(500);   // first tick, no prior tick to compare — no log
  t = 100;
  log.noteRafTick(500);   // 100ms gap, under threshold — no log
  t = 800;
  log.noteRafTick(500);   // 700ms gap, over threshold — logs

  expect(log.stop()).toEqual([{ tMs: 800, label: "rAF stall: 700ms gap" }]);
});

it("format() renders entries as readable timestamped lines", () => {
  let t = 0;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  t = 1500;
  log.log("hello");
  log.stop();
  expect(log.format()).toBe("[1.50s] hello");
});

it("stop() detaches the visibilitychange listener so later changes aren't logged", () => {
  const log = new DiagnosticsLog({ now: () => 0 });
  log.start();
  log.stop();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(log.stop()).toEqual([]);
});

it("startHeartbeat logs when rAF has produced no ticks for a while, even without any noteRafTick calls", () => {
  vi.useFakeTimers();
  let t = 0;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  log.startHeartbeat(1000, 500);

  t = 1000;
  vi.advanceTimersByTime(1000); // no noteRafTick ever called — rAF is fully silent

  expect(log.stop()).toEqual([{ tMs: 1000, label: "heartbeat: rAF silent for 1000ms" }]);
  vi.useRealTimers();
});

it("startHeartbeat stays quiet when the most recent rAF tick is within the threshold", () => {
  vi.useFakeTimers();
  let t = 0;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  log.startHeartbeat(1000, 500);

  // Simulate rAF ticking steadily every 100ms, right up to the heartbeat check at t=1000.
  for (let i = 1; i <= 9; i++) {
    t = i * 100;
    log.noteRafTick(500);
  }
  vi.advanceTimersByTime(1000); // heartbeat checks at t=1000 → only a 100ms gap since the last tick

  expect(log.stop()).toEqual([]);
  vi.useRealTimers();
});

it("startHeartbeat is silenced once stop() clears the interval", () => {
  vi.useFakeTimers();
  let t = 0;
  const log = new DiagnosticsLog({ now: () => t });
  log.start();
  log.startHeartbeat(1000, 500);
  log.stop();

  t = 2000;
  vi.advanceTimersByTime(2000);

  expect(log.stop()).toEqual([]);
  vi.useRealTimers();
});
