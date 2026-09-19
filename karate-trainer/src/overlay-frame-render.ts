// Renders a single overlay state (種目名/countdown/掛け声/工夫メモ) as a
// transparent PNG, for later compositing onto the raw recorded video via
// ffmpeg.wasm. Reuses the same pill-background + text look as the old live
// CanvasCompositor, but draws no camera frame — overlay only.
import type { CompositorState } from "./overlay-event-log";

const CANVAS_W = 720;
const CANVAS_H = 1280;

export interface FrameRenderDeps {
  canvas?: HTMLCanvasElement;
}

export function renderOverlayFrame(
  state: CompositorState,
  deps: FrameRenderDeps = {},
): Promise<Blob> {
  const canvas = deps.canvas ?? document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("2D context unavailable"));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { drill, seconds, cue, caption } = state;
  // The countdown sits beside the drill name as a small badge — a big number
  // lower in the frame lands right on the child's face in portrait video.
  const secsText = seconds > 0 ? String(seconds) : "";
  if (drill && secsText) {
    const drillW = labelBoxWidth(ctx, drill, 44);
    const secsW = labelBoxWidth(ctx, secsText, 40);
    const gap = 16;
    const left = CANVAS_W / 2 - (drillW + gap + secsW) / 2;
    drawLabel(ctx, drill, left + drillW / 2, 90, 44, "#ffffff", "rgba(0,0,0,0.6)");
    drawLabel(ctx, secsText, left + drillW + gap + secsW / 2, 90, 40, "#ffd166", "rgba(0,0,0,0.55)");
  } else if (drill) {
    drawLabel(ctx, drill, CANVAS_W / 2, 90, 44, "#ffffff", "rgba(0,0,0,0.6)");
  } else if (secsText) {
    drawLabel(ctx, secsText, CANVAS_W / 2, 90, 40, "#ffd166", "rgba(0,0,0,0.55)");
  }

  // TEXT mode: the revealed read-aloud words, laid out as typed (≤5 × ≤3),
  // in rows under the drill name. Each word is its own centered pill.
  const TEXT_FONT = 36;
  const TEXT_GAP = 14;
  const TEXT_ROW0_Y = 185;
  const TEXT_ROW_H = 92;
  (state.texts ?? []).forEach((words, row) => {
    if (words.length === 0) return;
    const widths = words.map((w) => labelBoxWidth(ctx, w, TEXT_FONT));
    const totalW = widths.reduce((a, b) => a + b, 0) + TEXT_GAP * (words.length - 1);
    let x = CANVAS_W / 2 - totalW / 2;
    words.forEach((w, i) => {
      drawLabel(ctx, w, x + widths[i] / 2, TEXT_ROW0_Y + row * TEXT_ROW_H, TEXT_FONT, "#ffffff", "rgba(0,0,0,0.6)");
      x += widths[i] + TEXT_GAP;
    });
  });
  if (cue) drawLabel(ctx, cue, CANVAS_W / 2, CANVAS_H / 2, 72, "#ffd166", "rgba(214,48,49,0.85)");
  if (caption) drawLabel(ctx, caption, CANVAS_W / 2, CANVAS_H - 90, 34, "#1a162b", "rgba(255,209,102,0.92)");

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}

// Width of the pill drawLabel() would produce, so side-by-side labels can be
// centered as a pair. Must mirror drawLabel's font and horizontal padding.
function labelBoxWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
): number {
  ctx.font = `900 ${fontPx}px "Hiragino Sans", sans-serif`;
  return ctx.measureText(text).width + fontPx; // + padX * 2
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fontPx: number,
  color: string,
  bg: string,
): void {
  ctx.font = `900 ${fontPx}px "Hiragino Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(text);
  const padX = fontPx * 0.5;
  const padY = fontPx * 0.35;
  const boxW = metrics.width + padX * 2;
  const boxH = fontPx + padY * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, fontPx * 0.3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
