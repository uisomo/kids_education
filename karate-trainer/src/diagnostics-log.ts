// Lightweight on-device diagnostics for tracking down the iPhone Safari
// video-freeze bug (image stalls ~20-30s into a recording while audio keeps
// going). There's no Mac available to use Safari's remote Web Inspector, so
// this collects the same kind of evidence — video track mute/ended events,
// tab visibility changes, and rAF stalls — as a plain timestamped text log
// that's readable directly on the done screen, no devtools needed.
export interface DiagnosticsEntry {
  tMs: number;
  label: string;
}

export interface DiagnosticsLogDeps {
  now?: () => number;
}

export class DiagnosticsLog {
  private now: () => number;
  private entries: DiagnosticsEntry[] = [];
  private startTime = 0;
  private detachFns: (() => void)[] = [];

  constructor(deps: DiagnosticsLogDeps = {}) {
    this.now = deps.now ?? (() => performance.now());
  }

  start(): void {
    this.startTime = this.now();
    this.entries = [];
    const onVisibility = () => this.log(`visibilitychange: ${document.visibilityState}`);
    document.addEventListener("visibilitychange", onVisibility);
    this.detachFns.push(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  log(label: string): void {
    this.entries.push({ tMs: Math.round(this.now() - this.startTime), label });
  }

  // Attach mute/unmute/ended listeners to every track on the recorded stream,
  // so a stalled camera video track (audio keeps flowing, video does not)
  // shows up as a timestamped entry instead of being invisible.
  watchStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      const tag = `${track.kind}:${track.label || track.id}`;
      const onMute = () => this.log(`track mute: ${tag}`);
      const onUnmute = () => this.log(`track unmute: ${tag}`);
      const onEnded = () => this.log(`track ended: ${tag}`);
      track.addEventListener("mute", onMute);
      track.addEventListener("unmute", onUnmute);
      track.addEventListener("ended", onEnded);
      this.detachFns.push(() => {
        track.removeEventListener("mute", onMute);
        track.removeEventListener("unmute", onUnmute);
        track.removeEventListener("ended", onEnded);
      });
    }
  }

  // Call once per rAF tick. Logs a gap whenever the time since the previous
  // tick exceeds thresholdMs — a stalled main thread (which would also freeze
  // the on-screen countdown) shows up as one of these.
  private lastTickMs: number | null = null;
  noteRafTick(thresholdMs = 500): void {
    const nowMs = this.now() - this.startTime;
    if (this.lastTickMs !== null && nowMs - this.lastTickMs > thresholdMs) {
      this.log(`rAF stall: ${Math.round(nowMs - this.lastTickMs)}ms gap`);
    }
    this.lastTickMs = nowMs;
  }

  // noteRafTick() can only report a stall while rAF keeps firing at all — if
  // rAF stops entirely (e.g. iOS Safari throttling it independent of the rest
  // of the main thread), that path goes silent too. setInterval runs on a
  // different browser scheduling path, so this heartbeat can catch "rAF has
  // produced zero ticks in a while" even when noteRafTick itself never runs
  // again to report it.
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  startHeartbeat(intervalMs = 1000, thresholdMs = 500): void {
    this.heartbeatHandle = setInterval(() => {
      const nowMs = this.now() - this.startTime;
      const sinceLastTick = this.lastTickMs === null ? nowMs : nowMs - this.lastTickMs;
      if (sinceLastTick > thresholdMs) {
        this.log(`heartbeat: rAF silent for ${Math.round(sinceLastTick)}ms`);
      }
    }, intervalMs);
  }

  stop(): DiagnosticsEntry[] {
    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];
    if (this.heartbeatHandle !== null) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
    return this.entries;
  }

  format(): string {
    return this.entries.map((e) => `[${(e.tMs / 1000).toFixed(2)}s] ${e.label}`).join("\n");
  }
}
