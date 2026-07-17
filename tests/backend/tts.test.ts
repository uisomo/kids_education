import { describe, it, expect, vi } from "vitest";
import { synthesize, TtsUnavailableError } from "../../src/backend/services/tts";

describe("synthesize", () => {
  it("chains audio_query then synthesis and returns wav bytes", async () => {
    const wav = new ArrayBuffer(4);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ speedScale: 1 }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => wav });
    const out = await synthesize("http://vv", "こんにちは", 13, fetchFn as never);
    expect(out).toBe(wav);
    expect(fetchFn.mock.calls[0][0]).toContain("/audio_query?");
    expect(fetchFn.mock.calls[1][0]).toContain("/synthesis?speaker=13");
  });
  it("throws TtsUnavailableError when engine is down", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(synthesize("http://vv", "x", 1, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
  it("throws TtsUnavailableError on non-ok status", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(synthesize("http://vv", "x", 1, fetchFn as never))
      .rejects.toThrow(TtsUnavailableError);
  });
});
