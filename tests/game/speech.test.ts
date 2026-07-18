// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { DebugRecognizer, Recognizer } from "../../src/game/speech";

interface FakeResultItem {
  transcript: string;
}

interface FakeResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: FakeResultItem;
}

interface FakeResultList {
  readonly length: number;
  [index: number]: FakeResult;
}

interface FakeEvent {
  results: FakeResultList;
}

class FakeRec {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: FakeEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  start() {}
  stop() {}
}

describe("Recognizer", () => {
  it("falls back to text.length * 120 for voicedMs when the first result is already final", () => {
    (window as never as { webkitSpeechRecognition: new () => FakeRec }).webkitSpeechRecognition = FakeRec;
    const onFinal = vi.fn();
    const r = new Recognizer({ onInterim: vi.fn(), onFinal, onSilence: vi.fn() });
    const fake = (r as unknown as { rec: FakeRec }).rec;
    const text = "こんにちは";
    const result: FakeResult = { length: 1, isFinal: true, 0: { transcript: text } };
    const event: FakeEvent = { results: { length: 1, 0: result } };
    fake.onresult?.(event);
    expect(onFinal).toHaveBeenCalledWith(text, text.length * 120);
  });

  it("stops listening and reports onMicError when the mic is denied", () => {
    (window as never as { webkitSpeechRecognition: new () => FakeRec }).webkitSpeechRecognition = FakeRec;
    const onMicError = vi.fn();
    const r = new Recognizer({ onInterim: vi.fn(), onFinal: vi.fn(), onSilence: vi.fn(), onMicError });
    const fake = (r as unknown as { rec: FakeRec }).rec;
    r.start();
    expect(r.listening).toBe(true);
    fake.onerror?.({ error: "not-allowed" });
    expect(r.listening).toBe(false);
    expect(onMicError).toHaveBeenCalled();
  });
});

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

  it("re-arms the silence timer so onSilence keeps firing while listening continues", () => {
    vi.useFakeTimers();
    const onSilence = vi.fn();
    const r = new DebugRecognizer({ onInterim: vi.fn(), onFinal: vi.fn(), onSilence });
    r.start();
    vi.advanceTimersByTime(30_500);
    expect(onSilence).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
