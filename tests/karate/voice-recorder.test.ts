import { describe, it, expect, vi } from "vitest";
import { VoiceRecorder } from "../../karate-trainer/src/voice-recorder";

it("records an audio clip into a blob", async () => {
  (globalThis as any).MediaRecorder = class {
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    static isTypeSupported() { return true; }
    start() {}
    stop() { this.ondataavailable?.({ data: new Blob(["a"]) }); this.onstop?.(); }
  };
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const r = new VoiceRecorder({ getMedia: async () => stream });
  await r.start();
  const blob = await r.stop();
  expect(blob.size).toBeGreaterThan(0);
});
