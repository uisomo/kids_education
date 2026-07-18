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

  it("interrupt during pending fetch prevents stale playback", async () => {
    if (!(URL as unknown as { createObjectURL?: unknown }).createObjectURL) {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    }
    const playCalls: string[] = [];
    class FakeAudio {
      src: string;
      volume = 1;
      loop = false;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src?: string) { this.src = src ?? ""; }
      play() { playCalls.push(this.src); return Promise.resolve(); }
      pause() {}
    }
    (window as unknown as { Audio: unknown }).Audio = FakeAudio;

    let resolveFetch!: (v: { ok: boolean; blob: () => Promise<Blob> }) => void;
    const fetchFn = vi.fn(() => new Promise((r) => { resolveFetch = r; }));
    const am = new AudioMan(fetchFn as never);

    const p = am.speak("こんにちは", 13);
    await new Promise((r) => setTimeout(r, 0));
    am.interrupt();
    resolveFetch({ ok: true, blob: async () => new Blob() });
    await p;

    expect(playCalls.length).toBe(0);
  });

  it("playBgm while ducked starts at ducked volume", async () => {
    const created: InstanceType<typeof FakeAudioBgm>[] = [];
    class FakeAudioBgm {
      src: string;
      volume = 1;
      loop = false;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src?: string) { this.src = src ?? ""; created.push(this); }
      play() { return Promise.resolve(); }
      pause() {}
    }
    (window as unknown as { Audio: unknown }).Audio = FakeAudioBgm;

    const fetchFn = vi.fn(() => new Promise(() => { /* never resolves */ }));
    const am = new AudioMan(fetchFn as never);

    void am.speak("こんにちは", 13); // duck(true) runs synchronously before the pending await
    await new Promise((r) => setTimeout(r, 0));

    am.playBgm("battle");
    const bgm = created[created.length - 1];
    expect(bgm.volume).toBe(0.12);
  });
});
