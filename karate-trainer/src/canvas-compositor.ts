// Canvas compositor: draws the camera video plus burned-in text onto an
// offscreen canvas every frame, and exposes captureStream() so the recorder
// captures the composited picture (camera + 種目名 / countdown / cue / 工夫)
// instead of the raw camera feed. The recording is NOT mirrored, so the
// burned-in text reads correctly on playback.
//
// The on-screen DOM overlay (training-screen) is independent — this class only
// feeds the recorded file.

export interface CompositorState {
  drill: string;      // 種目名 (top)
  seconds: number;    // countdown (large, upper-center); <=0 hides it
  cue: string;        // 掛け声 e.g. "ファイト！" (center flash); "" hides it
  caption: string;    // 工夫メモ (bottom); "" hides it
}

export interface CompositorDeps {
  // Injectable for tests. Defaults create a real detached <canvas>.
  canvas?: HTMLCanvasElement;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
  now?: () => number;
}

const CANVAS_W = 720;
const CANVAS_H = 1280;   // portrait 9:16

export class CanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private raf: (cb: () => void) => number;
  private cancelRaf: (id: number) => void;
  private rafId = 0;
  private running = false;

  private state: CompositorState = { drill: "", seconds: 0, cue: "", caption: "" };

  constructor(private video: HTMLVideoElement, deps: CompositorDeps = {}) {
    this.canvas = deps.canvas ?? document.createElement("canvas");
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext("2d");
    this.raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancelRaf = deps.cancelRaf ?? ((id) => cancelAnimationFrame(id));
  }

  setState(patch: Partial<CompositorState>): void {
    this.state = { ...this.state, ...patch };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.drawFrame();
      this.rafId = this.raf(loop);
    };
    this.rafId = this.raf(loop);
  }

  stop(): void {
    this.running = false;
    this.cancelRaf(this.rafId);
  }

  // Exposed for tests / one-off renders.
  drawFrame(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Camera frame, cover-fit, NOT mirrored.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    this.drawVideoCover(ctx, w, h);

    const { drill, seconds, cue, caption } = this.state;

    // 種目名 — top band
    if (drill) {
      this.drawLabel(ctx, drill, w / 2, 90, 44, "#ffffff", "rgba(0,0,0,0.6)");
    }
    // countdown — large, upper-center
    if (seconds > 0) {
      this.drawLabel(ctx, String(seconds), w / 2, 230, 150, "#ffd166", "rgba(0,0,0,0.55)");
    }
    // 掛け声 — center flash
    if (cue) {
      this.drawLabel(ctx, cue, w / 2, h / 2, 72, "#ffd166", "rgba(214,48,49,0.85)");
    }
    // 工夫メモ — bottom caption
    if (caption) {
      this.drawLabel(ctx, caption, w / 2, h - 90, 34, "#1a162b", "rgba(255,209,102,0.92)");
    }
  }

  private drawVideoCover(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const vw = this.video.videoWidth || w;
    const vh = this.video.videoHeight || h;
    if (!vw || !vh) return;
    // cover fit
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    try {
      ctx.drawImage(this.video, dx, dy, dw, dh);
    } catch {
      /* video not ready — skip this frame's image */
    }
  }

  // Rounded pill background + centered text.
  private drawLabel(
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
    this.roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, fontPx * 0.3);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
  }

  private roundRect(
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

  // Composited video track + the camera's original audio track(s).
  captureStream(cameraStream: MediaStream, fps = 30): MediaStream {
    const canvasStream = this.canvas.captureStream(fps);
    const out = new MediaStream();
    canvasStream.getVideoTracks().forEach((t) => out.addTrack(t));
    cameraStream.getAudioTracks().forEach((t) => out.addTrack(t));
    return out;
  }

  static isSupported(canvas?: HTMLCanvasElement): boolean {
    const c = canvas ?? (typeof document !== "undefined" ? document.createElement("canvas") : null);
    return !!c && typeof c.captureStream === "function";
  }
}
