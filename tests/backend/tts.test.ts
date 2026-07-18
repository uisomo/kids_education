import { describe, it, expect, vi, beforeEach } from "vitest";
import { synthesize, TtsUnavailableError, resetTtsAvailabilityCache } from "../../src/backend/services/tts";

describe("synthesize", () => {
  beforeEach(() => resetTtsAvailabilityCache());
  it("chains audio_query then synthesis and returns wav bytes", async () => {
    const wav = new ArrayBuffer(4);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ speedScale: 1 }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => wav });
    const out = await synthesize("http://vv", "こんにちは", 13, 1.2, fetchFn as never);
    expect(out).toBe(wav);
    expect(fetchFn.mock.calls[0][0]).toContain("/audio_query?");
    expect(fetchFn.mock.calls[1][0]).toContain("/synthesis?speaker=13");
  });
  it("applies the requested speed to the audio query", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ speedScale: 1 }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await synthesize("http://vv", "こんにちは", 13, 1.2, fetchFn as never);
    const body = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(body.speedScale).toBe(1.2);
  });
  it("throws TtsUnavailableError when engine is down", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(synthesize("http://vv", "x", 1, 1.2, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
  it("throws TtsUnavailableError on non-ok status", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(synthesize("http://vv", "x", 1, 1.2, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
  it("aborts slow engine connections instead of hanging", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ speedScale: 1 }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    await synthesize("http://vv", "x", 1, 1.2, fetchFn as never);
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchFn.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("skips contacting the engine for a while after a connection failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(synthesize("http://vv", "x", 1, 1.2, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
    fetchFn.mockClear();
    await expect(synthesize("http://vv", "y", 1, 1.2, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
    expect(fetchFn).not.toHaveBeenCalled(); // fail-fast: no 10s hang per line
  });
});
