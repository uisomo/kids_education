import { describe, it, expect, vi } from "vitest";
import { VideoRecorder } from "../../karate-trainer/src/recorder";

describe("VideoRecorder", () => {
  it("prefers mp4 when supported (iOS)", () => {
    // stub global if absent in jsdom-less env
    (globalThis as any).MediaRecorder = { isTypeSupported: (t: string) => t === "video/mp4" };
    const r = new VideoRecorder();
    expect(r.pickMime()).toBe("video/mp4");
    expect(r.fileExtension()).toBe("mp4");
  });

  it("assembles recorded chunks into one blob", async () => {
    (globalThis as any).MediaRecorder = class {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() { return true; }
      constructor(public stream: MediaStream, public opts: { mimeType: string }) {}
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(["ab"], { type: "video/mp4" }) });
        this.onstop?.();
      }
    };
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const r = new VideoRecorder({ getMedia: async () => fakeStream });
    await r.startCamera();
    r.startRecording();
    const blob = await r.stop();
    expect(blob.size).toBeGreaterThan(0);
  });
});
