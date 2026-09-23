// Logs timestamped overlay state changes (drill/seconds/cue/caption) during a
// training session, for later offline burn-in — replaces CanvasCompositor's
// role in app.ts, but does no drawing and holds no canvas.

export interface CompositorState {
  drill: string;      // 種目名
  seconds: number;     // countdown; <=0 hides it
  cue: string;         // 掛け声; "" hides it
  caption: string;     // 工夫メモ; "" hides it
  // Optional so existing state literals stay valid; the web burn-in ignores both.
  intro?: string;      // Ready / 3 / 2 / 1 / Go!!; "" or absent hides it
  drillIndex?: number; // position in the session menu of the drill now running
  // TEXT mode: the words revealed so far, in their line layout (max 5 × 3).
  // Empty/absent hides it. The live-only 読み上げよう hint is deliberately NOT
  // part of this state, so it is never burned into the recording.
  texts?: string[][];
  // 🪝 which HOOK_PALETTES entry those words are painted in, and whether the
  // colour changes per line or per character (hook-style.ts). The native
  // burn-in reads both; the web burn-in ignores them.
  textPalette?: number;
  textColorMode?: "line" | "char";
}

// A sound the phone played during the session. With echo-cancelled input the
// microphone no longer hears these through the speaker, so the native export
// mixes them back into the video from the original files.
export type SoundEventInput =
  | { kind: "bgm"; playing: boolean; restart?: boolean; src?: string }
  | { kind: "clip"; src: string };
export type SoundEvent = SoundEventInput & { t: number };

// One row of the 特訓一覧 panel burned into native recordings.
export interface OverlayMenuItem {
  name: string;
  seconds: number;
  kind: "drill" | "rest";
  // 積み重ね bars for the row (saved menus only): the level before this practice,
  // and whether this row earns one more (lit once the row is done).
  level?: number;
  gained?: boolean;
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
  private sounds: SoundEvent[] = [];

  constructor(deps: OverlayEventLogDeps = {}) {
    this.now = deps.now ?? (() => performance.now());
  }

  start(): void {
    this.startTime = this.now();
    this.events = [];
    this.sounds = [];
  }

  setState(patch: Partial<CompositorState>): void {
    this.events.push({ t: this.now() - this.startTime, patch });
  }

  getEvents(): OverlayEvent[] {
    return this.events;
  }

  logSound(sound: SoundEventInput): void {
    this.sounds.push({ ...sound, t: this.now() - this.startTime });
  }

  getSounds(): SoundEvent[] {
    return this.sounds;
  }

  // Elapsed time since start(), on the same clock as event timestamps (t).
  // Used as the burn-in pass's totalDurationMs so segment windows are anchored
  // to the same origin as the events they bound — see app.ts finishSession().
  elapsedMs(): number {
    return this.now() - this.startTime;
  }
}
