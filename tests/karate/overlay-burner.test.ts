import { it, expect, vi } from "vitest";
import { burnOverlay } from "../../karate-trainer/src/overlay-burner";
import type { OverlayEvent } from "../../karate-trainer/src/overlay-event-log";

function fakeFfmpeg() {
  const written: Record<string, Uint8Array> = {};
  const execCalls: string[][] = [];
  return {
    ffmpeg: {
      load: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn(async (name: string, data: Uint8Array) => { written[name] = data; }),
      exec: vi.fn(async (args: string[]) => { execCalls.push(args); }),
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
    written,
    execCalls,
  };
}

const renderFrame = vi.fn(async () => new Blob(["png"], { type: "image/png" }));

it("collapses events into segments, renders one PNG per segment, and runs ffmpeg once", async () => {
  const { ffmpeg, written, execCalls } = fakeFfmpeg();
  const events: OverlayEvent[] = [
    { t: 0, patch: { drill: "前蹴り", seconds: 0, cue: "", caption: "" } },
    { t: 1000, patch: { seconds: 3 } },
    { t: 2000, patch: { cue: "ファイト！" } },
  ];

  const result = await burnOverlay(
    new Blob(["raw"], { type: "video/mp4" }),
    events,
    3000,
    "mp4",
    { makeFfmpeg: async () => ffmpeg, renderFrame },
  );

  expect(renderFrame).toHaveBeenCalledTimes(3);
  expect(ffmpeg.load).toHaveBeenCalledOnce();
  expect(Object.keys(written)).toContain("input.mp4");
  expect(execCalls).toHaveLength(1);
  const args = execCalls[0].join(" ");
  expect(args).toContain("overlay");
  expect(args).toContain("enable='between(t,0,1)'");
  expect(args).toContain("enable='between(t,1,2)'");
  expect(args).toContain("enable='between(t,2,3)'");
  expect(result).toBeInstanceOf(Blob);
});

it("returns null when ffmpeg fails to load", async () => {
  const result = await burnOverlay(
    new Blob(["raw"]),
    [{ t: 0, patch: { drill: "型", seconds: 0, cue: "", caption: "" } }],
    1000,
    "mp4",
    { makeFfmpeg: async () => { throw new Error("wasm unsupported"); }, renderFrame },
  );
  expect(result).toBeNull();
});

it("reports the failure message via onError when ffmpeg fails to load", async () => {
  const onError = vi.fn();
  await burnOverlay(
    new Blob(["raw"]),
    [{ t: 0, patch: { drill: "型", seconds: 0, cue: "", caption: "" } }],
    1000,
    "mp4",
    { makeFfmpeg: async () => { throw new Error("wasm unsupported"); }, renderFrame },
    onError,
  );
  expect(onError).toHaveBeenCalledWith("Error: wasm unsupported");
});

it("returns null when ffmpeg.exec throws", async () => {
  const { ffmpeg } = fakeFfmpeg();
  ffmpeg.exec = vi.fn().mockRejectedValue(new Error("oom"));
  const result = await burnOverlay(
    new Blob(["raw"]),
    [{ t: 0, patch: { drill: "型", seconds: 0, cue: "", caption: "" } }],
    1000,
    "mp4",
    { makeFfmpeg: async () => ffmpeg, renderFrame },
  );
  expect(result).toBeNull();
});

it("returns null with an empty event log rather than calling ffmpeg", async () => {
  const { ffmpeg } = fakeFfmpeg();
  const result = await burnOverlay(new Blob(["raw"]), [], 1000, "mp4", {
    makeFfmpeg: async () => ffmpeg, renderFrame,
  });
  expect(result).toBeNull();
  expect(ffmpeg.load).not.toHaveBeenCalled();
});
