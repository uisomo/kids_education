// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DebugRecognizer } from "../../src/game/speech";

describe("DebugRecognizer", () => {
  it("emits final with simulated voicedMs when tqSay is called", () => {
    const onFinal = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal, onSilence: vi.fn() });
    r.start();
    (window as never as { tqSay(t: string): void }).tqSay("やすくして");
    expect(onFinal).toHaveBeenCalledWith("やすくして", "やすくして".length * 120);
  });
  it("ignores tqSay while stopped", () => {
    const onFinal = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal, onSilence: vi.fn() });
    (window as never as { tqSay(t: string): void }).tqSay("x");
    expect(onFinal).not.toHaveBeenCalled();
  });
  it("fires onSilence after 10s of listening with no speech", () => {
    vi.useFakeTimers();
    const onSilence = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal: vi.fn(), onSilence });
    r.start();
    vi.advanceTimersByTime(10_100);
    expect(onSilence).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
