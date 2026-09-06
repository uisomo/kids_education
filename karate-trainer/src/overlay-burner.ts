// Offline overlay burn-in: given the raw camera+audio recording and the
// timestamped overlay event log, renders one transparent PNG per distinct
// overlay state and composites them onto the video with ffmpeg.wasm, each
// enabled only for its own time window. Runs entirely client-side, after
// recording has already stopped — decoupled from the live MediaRecorder
// path so it can never cause the freeze/silence bugs that live canvas
// compositing did on iOS Safari.
import type { OverlayEvent, CompositorState } from "./overlay-event-log";
import { renderOverlayFrame } from "./overlay-frame-render";

export interface FfmpegLike {
  load(opts: { coreURL: string; wasmURL: string }): Promise<void>;
  writeFile(name: string, data: Uint8Array): Promise<void>;
  exec(args: string[]): Promise<void>;
  readFile(name: string): Promise<Uint8Array>;
}

export interface OverlayBurnerDeps {
  makeFfmpeg?: () => Promise<FfmpegLike>;
  renderFrame?: typeof renderOverlayFrame;
}

interface Segment {
  state: CompositorState;
  startMs: number;
  endMs: number;
}

const EMPTY_STATE: CompositorState = { drill: "", seconds: 0, cue: "", caption: "" };

function toSegments(events: OverlayEvent[], totalDurationMs: number): Segment[] {
  if (events.length === 0) return [];
  const segments: Segment[] = [];
  let state: CompositorState = { ...EMPTY_STATE };
  for (let i = 0; i < events.length; i++) {
    state = { ...state, ...events[i].patch };
    const startMs = events[i].t;
    const endMs = i + 1 < events.length ? events[i + 1].t : totalDurationMs;
    if (endMs > startMs) segments.push({ state, startMs, endMs });
  }
  return segments;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

const FFMPEG_BASE_URL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";

async function defaultMakeFfmpeg(): Promise<FfmpegLike> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg() as unknown as FfmpegLike;
  // @ffmpeg/core-mt (the multi-threaded core, needed for the app's
  // cross-origin-isolation setup) requires its worker/wasm files to be
  // same-origin. burnOverlay() calls load() with the plain CDN URLs below;
  // wrap load() here so it fetches those URLs and converts them to
  // same-origin blob URLs before delegating to the real FFmpeg.load() —
  // passing the bare cross-origin URLs straight through has a real chance
  // of failing at runtime in actual browsers, even though it works fine in
  // unit tests (which inject their own FfmpegLike and never call this
  // function at all).
  const realLoad = ffmpeg.load.bind(ffmpeg);
  ffmpeg.load = async ({ coreURL, wasmURL }) => {
    const blobCoreURL = await toBlobURL(coreURL, "text/javascript");
    const blobWasmURL = await toBlobURL(wasmURL, "application/wasm");
    await realLoad({ coreURL: blobCoreURL, wasmURL: blobWasmURL });
  };
  return ffmpeg;
}

export async function burnOverlay(
  rawVideoBlob: Blob,
  events: OverlayEvent[],
  totalDurationMs: number,
  ext: string,
  deps: OverlayBurnerDeps = {},
): Promise<Blob | null> {
  const segments = toSegments(events, totalDurationMs);
  if (segments.length === 0) return null;

  const renderFrame = deps.renderFrame ?? renderOverlayFrame;
  const makeFfmpeg = deps.makeFfmpeg ?? defaultMakeFfmpeg;

  try {
    const ffmpeg = await makeFfmpeg();
    await ffmpeg.load({
      coreURL: `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
      wasmURL: `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
    });
    const inputName = `input.${ext}`;
    await ffmpeg.writeFile(inputName, await blobToUint8Array(rawVideoBlob));

    const pngNames: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      const png = await renderFrame(segments[i].state);
      const name = `overlay-${i}.png`;
      await ffmpeg.writeFile(name, await blobToUint8Array(png));
      pngNames.push(name);
    }

    const filterParts: string[] = [];
    let lastLabel = "0:v";
    segments.forEach((seg, i) => {
      const outLabel = i === segments.length - 1 ? "vout" : `v${i}`;
      const startSec = seg.startMs / 1000;
      const endSec = seg.endMs / 1000;
      filterParts.push(
        `[${lastLabel}][${i + 1}:v]overlay=enable='between(t,${startSec},${endSec})'[${outLabel}]`,
      );
      lastLabel = outLabel;
    });

    const outputName = `output.${ext}`;
    const args = [
      "-i", inputName,
      ...pngNames.flatMap((n) => ["-i", n]),
      "-filter_complex", filterParts.join(";"),
      "-map", "[vout]",
      "-map", "0:a?",
      "-c:a", "copy",
      outputName,
    ];
    await ffmpeg.exec(args);

    const outBytes = await ffmpeg.readFile(outputName);
    return new Blob([new Uint8Array(outBytes)], { type: rawVideoBlob.type || `video/${ext}` });
  } catch {
    return null;
  }
}
