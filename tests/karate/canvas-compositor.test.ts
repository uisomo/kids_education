// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { CanvasCompositor } from "../../karate-trainer/src/canvas-compositor";

// A fake 2D context that records fillText calls.
function fakeCtx() {
  return {
    texts: [] as string[],
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    fillText(this: { texts: string[] }, t: string) { this.texts.push(t); },
  };
}

function fakeCanvas(ctx: unknown): HTMLCanvasElement {
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    captureStream: vi.fn(() => ({ getVideoTracks: () => [{ kind: "video" }] })),
  } as unknown as HTMLCanvasElement;
}

const fakeVideo = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

it("burns drill name, countdown, cue and caption into the frame", () => {
  const ctx = fakeCtx();
  const comp = new CanvasCompositor(fakeVideo, { canvas: fakeCanvas(ctx) });
  comp.setState({ drill: "前蹴り", seconds: 12, cue: "ファイト！", caption: "腰を落とす" });
  comp.drawFrame();
  expect(ctx.texts).toContain("前蹴り");
  expect(ctx.texts).toContain("12");
  expect(ctx.texts).toContain("ファイト！");
  expect(ctx.texts).toContain("腰を落とす");
});

it("hides countdown/cue/caption when empty", () => {
  const ctx = fakeCtx();
  const comp = new CanvasCompositor(fakeVideo, { canvas: fakeCanvas(ctx) });
  comp.setState({ drill: "回し蹴り", seconds: 0, cue: "", caption: "" });
  comp.drawFrame();
  expect(ctx.texts).toEqual(["回し蹴り"]);
});

it("captureStream merges canvas video track with camera audio", () => {
  const ctx = fakeCtx();
  const comp = new CanvasCompositor(fakeVideo, { canvas: fakeCanvas(ctx) });
  const added: unknown[] = [];
  const RealMS = globalThis.MediaStream;
  (globalThis as any).MediaStream = class {
    addTrack(t: unknown) { added.push(t); }
  };
  const camera = { getAudioTracks: () => [{ kind: "audio" }] } as unknown as MediaStream;
  comp.captureStream(camera, 30);
  expect(added).toEqual([{ kind: "video" }, { kind: "audio" }]);
  (globalThis as any).MediaStream = RealMS;
});

it("start()/stop() drive the raf loop", () => {
  const ctx = fakeCtx();
  let cb: (() => void) | null = null;
  const raf = vi.fn((fn: () => void) => { cb = fn; return 1; });
  const cancelRaf = vi.fn();
  const comp = new CanvasCompositor(fakeVideo, { canvas: fakeCanvas(ctx), raf, cancelRaf });
  comp.setState({ drill: "型" });
  comp.start();
  expect(raf).toHaveBeenCalledOnce();
  cb!();                       // advance one frame
  expect(ctx.texts).toContain("型");
  comp.stop();
  expect(cancelRaf).toHaveBeenCalled();
});
