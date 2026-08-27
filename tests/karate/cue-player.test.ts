import { describe, it, expect, vi } from "vitest";
import { CuePlayer } from "../../karate-trainer/src/cue-player";
import type { CueRole } from "../../karate-trainer/src/cue-player";

function sink() {
  return {
    playUrl: vi.fn().mockResolvedValue(undefined),
    beep: vi.fn().mockResolvedValue(undefined),
    speak: vi.fn().mockResolvedValue(undefined),
  };
}
const emptySource = { list: (_r: CueRole) => [] as { id: string; url: string }[] };

describe("CuePlayer", () => {
  it("beeps for countdown when no recorded clips", async () => {
    const s = sink();
    await new CuePlayer(emptySource, s).countdown(3);
    expect(s.beep).toHaveBeenCalledOnce();
    expect(s.playUrl).not.toHaveBeenCalled();
  });

  it("speaks a default phrase when no encouragement clips", async () => {
    const s = sink();
    await new CuePlayer(emptySource, s, () => 0).encourage();
    expect(s.speak).toHaveBeenCalledWith("もっと早く");
  });

  it("plays a recorded clip when one exists", async () => {
    const s = sink();
    const source = { list: (r: CueRole) => r === "announce" ? [{ id: "1", url: "blob:x" }] : [] };
    await new CuePlayer(source, s).announce();
    expect(s.playUrl).toHaveBeenCalledWith("blob:x");
    expect(s.speak).not.toHaveBeenCalled();
  });

  it("picks a random recorded encouragement clip", async () => {
    const s = sink();
    const clips = [{ id: "1", url: "a" }, { id: "2", url: "b" }];
    const source = { list: (r: CueRole) => r === "encouragement" ? clips : [] };
    await new CuePlayer(source, s, () => 0.99).encourage();
    expect(s.playUrl).toHaveBeenCalledWith("b");
  });
});
