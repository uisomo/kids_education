import type { Menu, Drill } from "./types";
import { loadMenu, saveMenu, formatMMSS } from "./menu-store";
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
}

const ENCOURAGE_TEXTS = ["もっと早く", "一生懸命", "いいぞ"];

export class KarateApp {
  private menu: Menu;
  private videoRecorder: VideoRecorderLike | null = null;
  private recElapsedMs = 0;
  private cueCount = 0;
  private drillCount = 0;
  private recTimerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    this.menu = deps.menuOverride ?? loadMenu(deps.storage);
  }

  async start(): Promise<void> {
    this.showSetup();
  }

  private showSetup(): void {
    renderSetupScreen(this.root, {
      menu: this.menu,
      onChange: (menu) => {
        this.menu = menu;
        saveMenu(menu, this.deps.storage);
        this.showSetup();
      },
      onStart: () => { void this.beginTraining(); },
      onOpenVoice: () => this.showVoice(),
    });
  }

  private showVoice(): void {
    renderVoiceScreen(this.root, {
      store: this.deps.voiceStore,
      makeRecorder: () => this.deps.makeVoiceRecorder(),
      onBack: () => this.showSetup(),
    });
  }

  private async beginTraining(): Promise<void> {
    const view = renderTrainingScreen(this.root);

    this.videoRecorder = this.deps.makeVideoRecorder();
    const stream = await this.videoRecorder.startCamera();
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
    this.videoRecorder.startRecording();
    await this.deps.wakeGuard.acquire();

    this.recElapsedMs = 0;
    this.cueCount = 0;
    this.drillCount = 0;
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
        const text = ENCOURAGE_TEXTS[Math.floor(Math.random() * ENCOURAGE_TEXTS.length)];
        this.cueCount++;
        view.showCue(text);
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

    view.onPause(() => scheduler.pause());
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

    renderDoneScreen(this.root, {
      videoUrl,
      ext,
      stats: {
        time: formatMMSS(elapsedSeconds),
        drills: this.drillCount,
        cues: this.cueCount,
      },
      onDownload: () => {
        const a = document.createElement("a");
        a.href = videoUrl;
        a.download = `karate-training.${ext}`;
        a.click();
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
