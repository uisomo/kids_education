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
