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
import { latestKufu, addKufu, trimKufuHistory } from "./kufu-store";
import { bumpDrills } from "./progress-store";
import { renderStrengthScreen } from "./ui/strength-screen";
import { renderFamilyScreen } from "./ui/family-screen";
import { createBottomNav, type NavTab } from "./ui/bottom-nav";
import { scopedStorage } from "./scoped-storage";
import { getActiveId, loadMembers, addMember, removeMember, setActive } from "./member-store";
import { type Plan, PLAN_LIMITS, loadPlan, setPlan } from "./plan-store";
import { renderParentalGate } from "./parental-gate";
import {
  loadCharacterState,
  saveCharacterState,
  type CharacterId,
  type CharacterState,
} from "./character-store";

export interface VideoRecorderLike {
  startCamera(): Promise<MediaStream>;
  startRecording(streamOverride?: MediaStream): void;
  stop(): Promise<Blob>;
  fileExtension(): string;
}

// Factory for the canvas compositor, injected so app.ts stays testable and the
// heavy DOM/canvas dependency lives at the composition root (main.ts).
export interface CompositorLike {
  setState(patch: Partial<{ drill: string; seconds: number; cue: string; caption: string }>): void;
  start(): void;
  stop(): void;
  captureStream(cameraStream: MediaStream, fps?: number): MediaStream;
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
  // Prime the audio element inside a user-gesture handler (e.g. the Start tap)
  // so a later play() isn't blocked by the browser's autoplay policy. Without
  // this the FIRST session's BGM silently fails (the intro delays play() past
  // the gesture); subsequent sessions work because the element is unlocked.
  unlock(): void;
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
  // Optional canvas compositor factory: builds a compositor bound to the given
  // camera <video>, used to burn 種目名/countdown/cue/工夫 into the recording.
  // When omitted (or captureStream unsupported), recording falls back to the
  // raw camera feed with no burned-in text.
  makeCompositor?(video: HTMLVideoElement): CompositorLike;
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
  private compositor: CompositorLike | null = null;
  private activeTab: NavTab = "train";

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    // Family-shared base storage (member list + classes/presets live here).
    // Per-member data is read/written through mem() (scoped by active member).
    this.menu = deps.menuOverride ?? loadMenu(this.mem());
    this.characterState = loadCharacterState(this.mem());
  }

  // Base storage for family-shared data (member list, presets/classes).
  private base(): Storage {
    return this.deps.storage ?? localStorage;
  }

  // Storage scoped to the active member (menu / kufu / progress / character).
  private mem(): Storage {
    const base = this.base();
    return scopedStorage(base, getActiveId(base));
  }

  // The active member's plan-derived 工夫 cap (0 = 工夫 disabled, Free plan).
  private kufuLimit(): number {
    return PLAN_LIMITS[loadPlan(this.mem())].kufu;
  }

  // The family's effective preset (menu) cap = the highest plan cap across all
  // members. Presets are family-shared, so one member downgrading must never
  // delete another member's saved menus — only trim when the count exceeds
  // EVERY member's plan cap.
  private familyPresetLimit(): number {
    const base = this.base();
    return loadMembers(base).reduce((max, m) => {
      const cap = PLAN_LIMITS[loadPlan(scopedStorage(base, m.id))].presets;
      return Math.max(max, cap);
    }, 0);
  }

  async start(): Promise<void> {
    this.showSetup();
  }

  private showSetup(message?: string): void {
    renderSetupScreen(this.root, {
      menu: this.menu,
      onChange: (menu) => {
        this.menu = menu;
        saveMenu(menu, this.mem());
        this.showSetup();
      },
      onEdit: (menu) => {
        this.menu = menu;
        saveMenu(menu, this.mem());
      },
      onStart: () => {
        // Unlock BGM synchronously inside the tap gesture (autoplay policy).
        this.deps.bgm?.unlock();
        void this.beginTraining();
      },
      onOpenVoice: () => this.showVoice(),
      // Presets = classes, family-shared → base storage.
      presets: loadPresets(this.base()),
      onSavePreset: () => {
        const ask = this.deps.promptName
          ?? ((d: string) => (typeof window !== "undefined" ? window.prompt("メニュー名", d) : null));
        const name = ask("新しいメニュー")?.trim();
        if (!name) return;
        const saved = savePreset(name, this.menu, this.base(), this.familyPresetLimit());
        this.showSetup(saved ? undefined : "プランの上限です。アップグレードしてね");
      },
      onLoadPreset: (id) => {
        const preset = loadPresets(this.base()).find((p) => p.id === id);
        if (!preset) return;
        this.menu = structuredClone(preset.menu);
        saveMenu(this.menu, this.mem());
        this.showSetup();
      },
      onDeletePreset: (id) => {
        deletePreset(id, this.base());
        this.showSetup();
      },
      characterId: this.characterState.selectedId,
      onSelectCharacter: (id: CharacterId) => {
        this.characterState.selectedId = id;
        saveCharacterState(this.characterState, this.mem());
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

    this.mountTabNav("train");
  }

  // Append the bottom tab bar after a tab screen has rendered (the screen's
  // root.textContent reset would otherwise wipe it). Tapping a tab switches
  // screens. Full-screen flows (training/loading/intro/done) never call this.
  private mountTabNav(active: NavTab): void {
    this.activeTab = active;
    this.root.classList.add("has-bottom-nav");
    const nav = createBottomNav({
      active,
      onSelect: (tab) => {
        if (tab === this.activeTab) return;
        if (tab === "train") this.showSetup();
        else if (tab === "strength") this.showStrength();
        else this.showFamily();
      },
    });
    this.root.append(nav);
  }

  private showStrength(): void {
    renderStrengthScreen(this.root, { storage: this.mem() });
    this.mountTabNav("strength");
  }

  private familyUnlocked = false;

  private showFamily(): void {
    // Gate the 家族 tab once per session so kids can't change members/plans.
    if (!this.familyUnlocked) {
      renderParentalGate(this.root, {
        onPass: () => { this.familyUnlocked = true; this.showFamily(); },
        onCancel: () => this.showSetup(),
      });
      return;
    }
    this.renderFamily();
    this.mountTabNav("family");
  }

  private renderFamily(): void {
    const base = this.base();
    renderFamilyScreen(this.root, {
      members: loadMembers(base),
      activeId: getActiveId(base),
      onAddMember: (name) => { addMember(name, base); this.reloadForActiveMember(); this.showFamily(); },
      onRemoveMember: (id) => { removeMember(id, base); this.reloadForActiveMember(); this.showFamily(); },
      onSelectMember: (id) => { setActive(id, base); this.reloadForActiveMember(); this.showFamily(); },
      activePlan: loadPlan(this.mem()),
      onSelectPlan: (plan) => { this.changePlan(plan); this.showFamily(); },
    });
  }

  // Set the active member's plan and enforce the new caps immediately
  // (delete-on-downgrade): trim this member's 工夫 history to the plan cap, and
  // trim family-shared presets only if they now exceed EVERY member's cap.
  private changePlan(plan: Plan): void {
    setPlan(plan, this.mem());
    this.trimKufuToLimit();
    this.trimPresetsToFamilyLimit();
  }

  // Drop each drill's 工夫 history down to the current plan cap (0 clears all).
  private trimKufuToLimit(): void {
    trimKufuHistory(this.kufuLimit(), this.mem());
  }

  // Trim family-shared presets to the highest cap across all members.
  private trimPresetsToFamilyLimit(): void {
    const limit = this.familyPresetLimit();
    const list = loadPresets(this.base());
    if (list.length > limit) {
      // Keep the oldest `limit` presets (stable, predictable for parents).
      list.slice(limit).forEach((p) => deletePreset(p.id, this.base()));
    }
  }

  // Re-read the active member's per-member state after a member switch.
  private reloadForActiveMember(): void {
    this.menu = loadMenu(this.mem());
    this.characterState = loadCharacterState(this.mem());
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

    // Build the compositor (burns text into the recording) now that the camera
    // <video> exists. Record the composited stream when available, else the raw
    // camera feed. startRecording() runs here — after the video is wired up —
    // so the very first recorded frames already carry the overlay.
    this.compositor = this.deps.makeCompositor?.(view.videoEl) ?? null;
    if (this.compositor) {
      this.compositor.start();
      recorder.startRecording(this.compositor.captureStream(stream));
    } else {
      recorder.startRecording();
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
        // Show + burn the drill name and its saved 工夫 reminder.
        const caption = this.captionFor(drill);
        view.setCaption(caption);
        this.compositor?.setState({ drill: drill.name, caption });
        void cuePlayer.announce();
        const next = this.menu[index + 1];
        view.setNext(next ? next.name : null);
      },
      onTick: (secondsLeft: number) => {
        view.setTime(secondsLeft);
        this.compositor?.setState({ seconds: secondsLeft });
      },
      onEncourage: () => {
        this.cueCount++;
        view.showCue(ENCOURAGE_TOAST);
        this.compositor?.setState({ cue: ENCOURAGE_TOAST });
        setTimeout(() => this.compositor?.setState({ cue: "" }), 1800);
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

  // 工夫 caption for a drill: the child's latest saved note for this 種目,
  // shown on-screen and burned into the recording.
  private captionFor(drill: Drill): string {
    return latestKufu(drill.name, this.mem());
  }

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
    this.compositor?.stop();
    this.compositor = null;

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
    saveCharacterState(this.characterState, this.mem());

    // Deduped list of the drills practiced this session (rest excluded), each
    // with its latest saved 工夫 pre-filled for editing.
    const seen = new Set<string>();
    const kufuDrills = this.menu
      .filter((d) => d.kind !== "rest" && !seen.has(d.name) && seen.add(d.name))
      .map((d) => ({ name: d.name, current: latestKufu(d.name, this.mem()) }));

    // Count each practiced drill toward its 強さ level (+1 per session).
    bumpDrills(kufuDrills.map((d) => d.name), this.mem());

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
      kufuDrills,
      kufuEnabled: this.kufuLimit() > 0,
      onSaveKufu: (name, text) => { addKufu(name, text, this.mem(), this.kufuLimit()); },
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
