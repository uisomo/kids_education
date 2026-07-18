// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AudioMan } from "../../src/game/audio";

describe("AudioMan", () => {
  it("falls back to speechSynthesis when tts fetch fails", async () => {
    const speak = vi.fn();
    (window as never as { speechSynthesis: unknown }).speechSynthesis = {
      speak, cancel: vi.fn(),
    };
    (window as never as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
      class { constructor(public text: string) {} onend: (() => void) | null = null; };
    const am = new AudioMan(vi.fn().mockRejectedValue(new Error("down")) as never);
    const p = am.speak("こんにちは", 13);
    await new Promise((r) => setTimeout(r, 0));
    const utt = speak.mock.calls[0][0] as { onend: () => void };
    utt.onend(); // simulate finish
    await p;
    expect(speak).toHaveBeenCalled();
  });
});
