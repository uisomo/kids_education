import type { Menu, Drill } from "./types";
import { loadMenu, saveMenu, formatMMSS } from "./menu-store";
import { loadPresets, savePreset, deletePreset } from "./preset-store";
import { SessionScheduler, type SchedulerHandlers } from "./scheduler";
import { CuePlayer, type CueSink, type ClipSource } from "./cue-player";
import type { VoiceStore } from "./voice-store";
import { renderSetupScreen } from "./ui/setup-screen";
import { renderTrainingScreen, type TrainingView } from "./ui/training-screen";
import { renderDoneScreen } from "./ui/done-screen";
import { renderVoiceScreen } from "./ui/voice-screen";

export interface VideoRecorderLike {
  startCamera(): Promise<MediaStream>;
  startRecording(): void;
  stop(): Promise<Blob>;
  fileExtension(): string;
}

export interface VoiceRecorderLike {
  start(): Promise<void>;
  stop(): Promise<Blob>;
}

export interface WakeGuardLike {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export interface RafLoop {
  start(cb: (deltaMs: number) => void): void;
  stop(): void;
}

export interface KarateAppDeps {
  voiceStore: VoiceStore & ClipSource;
  audioSink: CueSink;
  makeVideoRecorder(): VideoRecorderLike;
  makeVoiceRecorder(): VoiceRecorderLike;
  wakeGuard: WakeGuardLike;
  rafLoop: RafLoop;
  menuOverride?: Menu;
  storage?: Storage;
  // How to ask the user for a preset name (defaults to window.prompt).
  // Injectable so the save flow is testable. Returns null to cancel.
  promptName?(defaultName: string): string | null;
  // 録画の共有（native → シェアシート / web → <a download>）。
  // platform.ts から注入される。
  shareRecording(blob: Blob, ext: string): Promise<void>;
}

// Generic on-screen toast for encouragement. The actual spoken/played cue is
// owned entirely by CuePlayer (a recorded clip if the user has any, otherwise a
// TTS phrase it picks itself). We deliberately do NOT echo a specific phrase
// here — a hardcoded phrase would contradict the audio (wrong TTS pick, or a
// recorded clip whose words we can't know). One neutral toast keeps the UI
// honest and avoids maintaining a second, divergent phrase list.
const ENCOURAGE_TOAST = "ファイト！";

export class KarateApp {
  private menu: Menu;
  private videoRecorder: VideoRecorderLike | null = null;
  private recElapsedMs = 0;
  private cueCount = 0;
  private drillCount = 0;
  private recTimerHandle: ReturnType<typeof setInterval> | null = null;
  private paused = false;

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    this.menu = deps.menuOverride ?? loadMenu(deps.storage);
  }

  async start(): Promise<void> {
    this.showSetup();
  }

  private showSetup(message?: string): void {
    renderSetupScreen(this.root, {
      menu: this.menu,
      onChange: (menu) => {
        this.menu = menu;
        saveMenu(menu, this.deps.storage);
        this.showSetup();
      },
      // Field edits (name / seconds): persist without re-rendering, so the
      // focused input and the iOS IME composition survive each keystroke.
      onEdit: (menu) => {
        this.menu = menu;
        saveMenu(menu, this.deps.storage);
      },
      onStart: () => { void this.beginTraining(); },
      onOpenVoice: () => this.showVoice(),
      presets: loadPresets(this.deps.storage),
      onSavePreset: () => {
        const ask = this.deps.promptName
          ?? ((d: string) => (typeof window !== "undefined" ? window.prompt("メニュー名", d) : null));
        const name = ask("新しいメニュー")?.trim();
        if (!name) return; // cancelled or empty → do nothing
        savePreset(name, this.menu, this.deps.storage);
        this.showSetup();
      },
      onLoadPreset: (id) => {
        const preset = loadPresets(this.deps.storage).find((p) => p.id === id);
        if (!preset) return;
        // Load a copy so later edits don't mutate the stored preset.
        this.menu = structuredClone(preset.menu);
        saveMenu(this.menu, this.deps.storage);
        this.showSetup();
      },
      onDeletePreset: (id) => {
        deletePreset(id, this.deps.storage);
        this.showSetup();
      },
    });
    if (message) {
      const note = document.createElement("div");
      note.dataset.setupStatus = "";
      note.className = "setup-status";
      note.setAttribute("role", "alert");
      note.textContent = message;
      // Show it above the drill list so it's immediately visible.
      this.root.prepend(note);
    }
  }

  private showVoice(): void {
    renderVoiceScreen(this.root, {
      store: this.deps.voiceStore,
      makeRecorder: () => this.deps.makeVoiceRecorder(),
      onBack: () => this.showSetup(),
    });
  }

  private async beginTraining(): Promise<void> {
    // Acquire the camera/recorder/wake lock BEFORE mounting the training
    // screen. If the camera is denied (a guaranteed first-launch scenario on
    // iOS) we must not leave a broken, buttonless training screen mounted —
    // instead we land the user back on setup with a message and a clean state
    // for retry.
    const recorder = this.deps.makeVideoRecorder();
    let stream: MediaStream;
    try {
      stream = await recorder.startCamera();
      recorder.startRecording();
      await this.deps.wakeGuard.acquire();
    } catch {
      // Camera denied/unavailable, or recording failed to start. Release any
      // partially-acquired wake lock and return to setup with a message.
      await this.deps.wakeGuard.release();
      this.videoRecorder = null;
      this.showSetup("カメラを開始できませんでした。権限を確認してください");
      return;
    }
    this.videoRecorder = recorder;

    const view = renderTrainingScreen(this.root);
    try {
      view.videoEl.srcObject = stream;
    } catch {
      // jsdom or older browsers may not support srcObject assignment cleanly.
    }
    try {
      const playResult = view.videoEl.play();
      void Promise.resolve(playResult).catch(() => { /* autoplay may be rejected — ignore */ });
    } catch {
      // jsdom's play() is unimplemented and may throw synchronously — ignore.
    }

    this.recElapsedMs = 0;
    this.cueCount = 0;
    this.drillCount = 0;
    this.paused = false;
    view.setPaused(false);
    this.startRecTimer(view);

    const cuePlayer = new CuePlayer(this.deps.voiceStore, this.deps.audioSink);

    const handlers: SchedulerHandlers = {
      onDrillStart: (drill: Drill, index: number, total: number) => {
        this.drillCount = index + 1;
        view.setDrill(drill, index + 1, total);
        void cuePlayer.announce();
        const next = this.menu[index + 1];
        view.setNext(next ? next.name : null);
      },
      onTick: (secondsLeft: number) => {
        view.setTime(secondsLeft);
      },
      onEncourage: () => {
        this.cueCount++;
        view.showCue(ENCOURAGE_TOAST);
        void cuePlayer.encourage();
      },
      onCountdown: (n: number) => {
        this.cueCount++;
        void cuePlayer.countdown(n);
      },
      onDrillEnd: () => { /* no-op: next drill start (or session end) follows immediately */ },
      onSessionEnd: () => { void this.finishSession(); },
    };

    const scheduler = new SessionScheduler(this.menu, handlers);

    view.onPause(() => {
      // Toggle: freeze both the scheduler and the REC elapsed timer so the
      // recorded stat matches wall-clock training time, then resume both.
      if (!this.paused) {
        this.paused = true;
        scheduler.pause();
        this.stopRecTimer();
        view.setPaused(true);
      } else {
        this.paused = false;
        scheduler.resume();
        this.startRecTimer(view);
        view.setPaused(false);
      }
    });
    view.onSkip(() => scheduler.skip());
    view.onStop(() => { void this.finishSession(); });

    this.scheduler = scheduler;
    scheduler.start();
    this.deps.rafLoop.start((deltaMs) => scheduler.tick(deltaMs));
  }

  private scheduler: SessionScheduler | null = null;

  private startRecTimer(view: TrainingView): void {
    this.stopRecTimer();
    this.recTimerHandle = setInterval(() => {
      this.recElapsedMs += 1000;
      view.setRecElapsed(`REC ${formatMMSS(Math.floor(this.recElapsedMs / 1000))}`);
    }, 1000);
  }

  private stopRecTimer(): void {
    if (this.recTimerHandle !== null) {
      clearInterval(this.recTimerHandle);
      this.recTimerHandle = null;
    }
  }

  private sessionEnding = false;

  private async finishSession(): Promise<void> {
    if (this.sessionEnding) return;
    this.sessionEnding = true;

    this.scheduler?.stop();
    this.deps.rafLoop.stop();
    this.stopRecTimer();

    const recorder = this.videoRecorder;
    const blob = recorder ? await recorder.stop() : new Blob();
    await this.deps.wakeGuard.release();

    const ext = recorder ? recorder.fileExtension() : "webm";
    const videoUrl = URL.createObjectURL(blob);

    const elapsedSeconds = Math.floor(this.recElapsedMs / 1000);

    const blobForShare = blob;
    renderDoneScreen(this.root, {
      videoUrl,
      ext,
      stats: {
        time: formatMMSS(elapsedSeconds),
        drills: this.drillCount,
        cues: this.cueCount,
      },
      onShare: () => {
        void this.deps.shareRecording(blobForShare, ext).catch((e) => {
          console.error("shareRecording failed", e);
        });
      },
      onAgain: () => {
        this.sessionEnding = false;
        this.videoRecorder = null;
        this.scheduler = null;
        this.showSetup();
      },
    });
  }
}
