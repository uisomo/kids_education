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
import { playCountdownIntro } from "./ui/countdown-intro";
import { renderLoadingScreen } from "./ui/loading-screen";
import {
  loadCharacterState,
  saveCharacterState,
  type CharacterId,
  type CharacterState,
} from "./character-store";

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

// Background music controller. Kept minimal so it's trivial to inject/mock.
export interface BgmPlayer {
  play(): void;
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
  promptName?(defaultName: string): string | null;
  shareRecording(blob: Blob, ext: string): Promise<void>;
  // Optional background music played during the session (Go!! → session end).
  bgm?: BgmPlayer;
  // Per-step duration of the Ready→3→2→1→Go!! intro. Default 700ms.
  // Pass 0 to disable the visible delay (used by tests).
  introStepMs?: number;
}

const ENCOURAGE_TOAST = "ファイト！";

export class KarateApp {
  private menu: Menu;
  private videoRecorder: VideoRecorderLike | null = null;
  private recElapsedMs = 0;
  private cueCount = 0;
  private drillCount = 0;
  private recTimerHandle: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private characterState: CharacterState;

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    this.menu = deps.menuOverride ?? loadMenu(deps.storage);
    this.characterState = loadCharacterState(deps.storage);
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
        if (!name) return;
        savePreset(name, this.menu, this.deps.storage);
        this.showSetup();
      },
      onLoadPreset: (id) => {
        const preset = loadPresets(this.deps.storage).find((p) => p.id === id);
        if (!preset) return;
        this.menu = structuredClone(preset.menu);
        saveMenu(this.menu, this.deps.storage);
        this.showSetup();
      },
      onDeletePreset: (id) => {
        deletePreset(id, this.deps.storage);
        this.showSetup();
      },
      characterId: this.characterState.selectedId,
      onSelectCharacter: (id: CharacterId) => {
        this.characterState.selectedId = id;
        saveCharacterState(this.characterState, this.deps.storage);
        this.showSetup();
      },
      characterState: this.characterState,
    });

    if (message) {
      const note = document.createElement("div");
      note.dataset.setupStatus = "";
      note.className = "setup-status";
      note.setAttribute("role", "alert");
      note.textContent = message;
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
    // Show a loading screen while the camera warms up (can take a moment).
    renderLoadingScreen(this.root);

    const recorder = this.deps.makeVideoRecorder();
    let stream: MediaStream;
    try {
      stream = await recorder.startCamera();
      recorder.startRecording();
      await this.deps.wakeGuard.acquire();
    } catch {
      await this.deps.wakeGuard.release();
      this.videoRecorder = null;
      this.showSetup("カメラを開始できませんでした。権限を確認してください");
      return;
    }
    this.videoRecorder = recorder;

    const view = renderTrainingScreen(this.root, this.characterState.selectedId);
    try {
      view.videoEl.srcObject = stream;
    } catch {
      /* ignore srcObject errors */
    }
    try {
      const playResult = view.videoEl.play();
      void Promise.resolve(playResult).catch(() => { /* autoplay rejected — ignore */ });
    } catch {
      /* ignore synchronously throwing play() in jsdom */
    }

    this.recElapsedMs = 0;
    this.cueCount = 0;
    this.drillCount = 0;
    this.paused = false;
    view.setPaused(false);

    // Ready → 3 → 2 → 1 → Go!! intro. Numbers beep, Ready/Go are spoken.
    // BGM and the drill timer both start on "Go!!".
    await playCountdownIntro(this.root, {
      stepMs: this.deps.introStepMs,
      onBeat: (cue) => {
        if (cue === "Ready") void this.deps.audioSink.speak("よーい");
        else if (cue === "Go!!") void this.deps.audioSink.speak("はじめ");
        else void this.deps.audioSink.beep();
      },
    });

    this.deps.bgm?.play();
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
      onDrillEnd: () => { /* no-op */ },
      onSessionEnd: () => { void this.finishSession(); },
    };

    const scheduler = new SessionScheduler(this.menu, handlers);

    view.onPause(() => {
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
    this.deps.bgm?.stop();

    const recorder = this.videoRecorder;
    const blob = recorder ? await recorder.stop() : new Blob();
    await this.deps.wakeGuard.release();

    const ext = recorder ? recorder.fileExtension() : "webm";
    const videoUrl = URL.createObjectURL(blob);

    const elapsedSeconds = Math.floor(this.recElapsedMs / 1000);

    // Award XP points to student & save
    const xpEarned = 50 + this.drillCount * 10;
    this.characterState.totalXp += xpEarned;
    this.characterState.completedCount += 1;
    saveCharacterState(this.characterState, this.deps.storage);

    const blobForShare = blob;
    renderDoneScreen(this.root, {
      videoUrl,
      ext,
      stats: {
        time: formatMMSS(elapsedSeconds),
        drills: this.drillCount,
        cues: this.cueCount,
      },
      characterId: this.characterState.selectedId,
      xpEarned,
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
