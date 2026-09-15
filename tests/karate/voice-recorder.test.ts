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

it("stop() settles immediately when the recorder is no longer recording", async () => {
  const stopSpy = vi.fn();
  const rec = {
    state: "recording",
    ondataavailable: null as ((e: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null,
    start() { this.state = "recording"; },
    stop() { stopSpy(); this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["a"]) }); this.onstop?.(); },
  };
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const r = new VoiceRecorder({ getMedia: async () => stream, makeRecorder: () => rec as unknown as MediaRecorder });
  await r.start();
  await r.stop();
  // A second stop must not hang (the old code waited on onstop forever).
  await expect(r.stop()).resolves.toBeInstanceOf(Blob);
  expect(stopSpy).toHaveBeenCalledTimes(1);
});

it("stop() resolves without calling stop() on an already-inactive recorder", async () => {
  const rec = {
    state: "inactive",
    ondataavailable: null, onstop: null, onerror: null,
    start() { /* recorder died on its own */ },
    stop: vi.fn(() => { throw new Error("InvalidStateError"); }),
  };
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const r = new VoiceRecorder({ getMedia: async () => stream, makeRecorder: () => rec as unknown as MediaRecorder });
  await r.start();
  await expect(r.stop()).resolves.toBeInstanceOf(Blob);
  expect(rec.stop).not.toHaveBeenCalled();
});

it("stop() never hangs if the recorder's stop() throws", async () => {
  const rec = {
    ondataavailable: null, onstop: null, onerror: null,
    start() {},
    stop() { throw new Error("InvalidStateError"); },
  };
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const r = new VoiceRecorder({ getMedia: async () => stream, makeRecorder: () => rec as unknown as MediaRecorder });
  await r.start();
  await expect(r.stop()).resolves.toBeInstanceOf(Blob);
});
