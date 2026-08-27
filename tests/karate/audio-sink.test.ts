// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { BrowserAudioSink } from "../../karate-trainer/src/audio-sink";

describe("BrowserAudioSink", () => {
  beforeAll(() => {
    // Polyfill SpeechSynthesisUtterance for jsdom
    if (typeof (globalThis as any).SpeechSynthesisUtterance === "undefined") {
      (globalThis as any).SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
        public lang: string = "";
        public onend: (() => void) | null = null;
        public onerror: (() => void) | null = null;
        constructor(public text: string) {}
      };
    }
  });

  it("plays a clip url via the audio element", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const el = { play, addEventListener: (e: string, cb: () => void) => e === "ended" && cb() } as unknown as HTMLAudioElement;
    const sink = new BrowserAudioSink({ makeAudio: () => el });
    await sink.playUrl("blob:x");
    expect(play).toHaveBeenCalledOnce();
  });

  it("speaks via the injected synth", async () => {
    const speak = vi.fn((u: SpeechSynthesisUtterance) => (u.onend as () => void)?.());
    const synth = { speak, cancel: vi.fn() } as unknown as SpeechSynthesis;
    const sink = new BrowserAudioSink({ synth });
    await sink.speak("もっと早く");
    expect(speak).toHaveBeenCalledOnce();
  });
});
