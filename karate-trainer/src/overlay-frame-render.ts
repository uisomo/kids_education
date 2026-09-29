// Renders a single overlay state (種目名/countdown/掛け声/工夫メモ) as a
// transparent PNG, for later compositing onto the raw recorded video via
// ffmpeg.wasm. Reuses the same pill + text layout as the old live
// CanvasCompositor, with the series' glossy pill; no camera frame — overlay only.
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
  if (caption) {
    const notes = caption.split("\n");
    notes.forEach((note, i) => {
      const font = Math.min(24, 270 / Math.max(1, [...note].length));
      drawLabel(ctx, note, CANVAS_W * 0.75, CANVAS_H - 170 + i * 44,
        font, "#1a162b", "rgba(255,209,102,0.92)");
    });
  }

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
  drawGlossyBox(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, fontPx * 0.3, bg);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

// The series' glossy pill (SERIES_GUIDE 5.2d), the same recipe as
// OverlayCompositor.drawBox: a darker "press" lip under the pill with a soft
// drop shadow, the fill, a light-top / dark-bottom sheen, a soft white
// highlight at the top left and a slightly darker rim.
function drawGlossyBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  bg: string,
): void {
  const lip = Math.max(2, h * 0.07);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = h * 0.28;
  ctx.shadowOffsetY = h * 0.08;
  ctx.fillStyle = "rgba(10,8,22,0.55)";
  roundRect(ctx, x, y + lip, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, "rgba(255,255,255,0.24)");
  sheen.addColorStop(0.48, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = sheen;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  roundRect(ctx, x + h * 0.28, y + h * 0.12, Math.max(0, Math.min(w * 0.42, w - h * 0.56)), h * 0.24, h * 0.12);
  ctx.fill();
  ctx.restore();

  const rim = Math.max(1.5, h * 0.035);
  ctx.lineWidth = rim;
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  roundRect(ctx, x + rim / 2, y + rim / 2, w - rim, h - rim, Math.max(1, r - rim / 2));
  ctx.stroke();
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
