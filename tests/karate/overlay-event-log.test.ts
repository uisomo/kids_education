import { it, expect } from "vitest";
import { OverlayEventLog } from "../../karate-trainer/src/overlay-event-log";

it("timestamps setState calls relative to start()", () => {
  let t = 1000;
  const log = new OverlayEventLog({ now: () => t });
  log.start();
  t = 1500;
  log.setState({ drill: "前蹴り" });
  t = 2200;
  log.setState({ seconds: 5 });
  expect(log.getEvents()).toEqual([
    { t: 500, patch: { drill: "前蹴り" } },
    { t: 1200, patch: { seconds: 5 } },
  ]);
});

it("returns an empty array when nothing was logged", () => {
  const log = new OverlayEventLog({ now: () => 0 });
  log.start();
  expect(log.getEvents()).toEqual([]);
});

it("defaults to performance.now() when no now() is injected", () => {
  const log = new OverlayEventLog();
  log.start();
  log.setState({ cue: "ファイト！" });
  const events = log.getEvents();
  expect(events).toHaveLength(1);
  expect(events[0].t).toBeGreaterThanOrEqual(0);
});

it("elapsedMs() returns time elapsed since start() on the same clock as event timestamps", () => {
  let t = 1000;
  const log = new OverlayEventLog({ now: () => t });
  log.start();
  t = 1500;
  log.setState({ drill: "前蹴り" });
  t = 4500;
  expect(log.elapsedMs()).toBe(3500);
});

it("records played sounds on the same clock as overlay events", () => {
  let now = 1000;
  const log = new OverlayEventLog({ now: () => now });
  log.start();
  now = 4500;
  log.logSound({ kind: "bgm", playing: true, restart: true, src: "/m.mp3" });
  now = 9200;
  log.logSound({ kind: "clip", src: "/characters/cheer/leo-2.mov" });
  expect(log.getSounds()).toEqual([
    { kind: "bgm", playing: true, restart: true, src: "/m.mp3", t: 3500 },
    { kind: "clip", src: "/characters/cheer/leo-2.mov", t: 8200 },
  ]);
  log.start();
  expect(log.getSounds()).toEqual([]);
});
