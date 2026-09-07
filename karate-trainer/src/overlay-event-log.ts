// Logs timestamped overlay state changes (drill/seconds/cue/caption) during a
// training session, for later offline burn-in — replaces CanvasCompositor's
// role in app.ts, but does no drawing and holds no canvas.

export interface CompositorState {
  drill: string;      // 種目名
  seconds: number;     // countdown; <=0 hides it
  cue: string;         // 掛け声; "" hides it
  caption: string;     // 工夫メモ; "" hides it
}

export interface OverlayEvent {
  t: number; // ms since start()
  patch: Partial<CompositorState>;
}

export interface OverlayEventLogDeps {
  now?: () => number;
}

export class OverlayEventLog {
  private now: () => number;
  private startTime = 0;
  private events: OverlayEvent[] = [];

  constructor(deps: OverlayEventLogDeps = {}) {
    this.now = deps.now ?? (() => performance.now());
  }

  start(): void {
    this.startTime = this.now();
    this.events = [];
  }

  setState(patch: Partial<CompositorState>): void {
    this.events.push({ t: this.now() - this.startTime, patch });
  }

  getEvents(): OverlayEvent[] {
    return this.events;
  }

  // Elapsed time since start(), on the same clock as event timestamps (t).
  // Used as the burn-in pass's totalDurationMs so segment windows are anchored
  // to the same origin as the events they bound — see app.ts finishSession().
  elapsedMs(): number {
    return this.now() - this.startTime;
  }
}
