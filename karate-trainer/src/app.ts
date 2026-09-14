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
import { latestKufu, addKufu, trimKufuHistory, canAddKufu } from "./kufu-store";
import { bumpDrills } from "./progress-store";
import { BELTS, addSessionBar, loadBelt, setBelt } from "./belt-store";
import { renderStrengthScreen } from "./ui/strength-screen";
import { renderFamilyScreen } from "./ui/family-screen";
import { createBottomNav, type NavTab } from "./ui/bottom-nav";
import { scopedStorage } from "./scoped-storage";
import { type Member, getActiveId, loadMembers, addMember, removeMember, setActive } from "./member-store";
import { type Plan, type PlanLimits, PLAN_LIMITS, loadPlan, setPlan } from "./plan-store";
import { getAssignedClass, setAssignedClass } from "./class-store";
import { getBgmMuted, setBgmMuted } from "./bgm-store";
import { loadComments, saveComment } from "./comment-store";
import { renderParentalGate } from "./parental-gate";
import {
  loadCharacterState,
  saveCharacterState,
  type CharacterId,
  type CharacterState,
} from "./character-store";
import { OverlayEventLog, type OverlayEvent, type OverlayMenuItem, type SoundEvent } from "./overlay-event-log";
import { DiagnosticsLog } from "./diagnostics-log";

export interface VideoRecorderLike {
  startCamera(): Promise<MediaStream>;
  // Native (AVFoundation) starts capture asynchronously; the web MediaRecorder
  // path is synchronous and simply returns void.
  startRecording(streamOverride?: MediaStream): void | Promise<void>;
  // The overlay log is passed through so a recorder that burns text in itself
  // (the native one) has what it needs. The web recorder ignores both and
  // relies on the separate burnOverlay() dep instead.
  // menu feeds the 特訓一覧 panel the native recorder burns into the video.
  // sounds lists the music and cheer clips the phone played, for the native
  // export to mix back in when echo cancellation keeps them out of the mic.
  stop(
    events?: OverlayEvent[],
    totalDurationMs?: number,
    menu?: OverlayMenuItem[],
    sounds?: SoundEvent[],
  ): Promise<Blob>;
  fileExtension(): string;
  // Native only: the finished file on disk, for handing to the OS share sheet
  // without round-tripping the video through base64.
  fileUri?(): string | null;
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
  // User-facing mute toggle (練習BGM on/off), independent of play()/stop()'s
  // session lifecycle. Muting during a session silences it immediately;
  // unmuting resumes only if a session is currently playing.
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  // Web path of the music file, so the native export can mix the same track
  // back in when echo cancellation keeps it out of the microphone.
  readonly src?: string;
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
  // fileUri is set on native, where the recording already exists on disk —
  // passing it lets the share sheet take the file directly instead of
  // re-encoding the whole video as base64 through the bridge.
  shareRecording(blob: Blob, ext: string, fileUri?: string | null): Promise<void>;
  // Optional background music played during the session (Go!! → session end).
  bgm?: BgmPlayer;
  // Plays a character's cheer voice (the clip's .m4a). Native routes it through
  // the same engine as the music, so one never pauses the other.
  playCheerVoice?(src: string): void;
  // Burns overlay text (種目名/countdown/cue/工夫) into the saved recording as
  // an offline post-process, after the raw camera+audio recording has already
  // stopped. Returns null on any failure (unsupported browser, ffmpeg error)
  // — the caller falls back to the raw video with no burned-in text.
  burnOverlay?(
    rawVideoBlob: Blob,
    events: OverlayEvent[],
    totalDurationMs: number,
    ext: string,
    onError?: (message: string) => void,
  ): Promise<Blob | null>;
  // Per-step duration of the Ready→3→2→1→Go!! intro. Default 700ms.
  // Pass 0 to disable the visible delay (used by tests).
  introStepMs?: number;
}


export class KarateApp {
  private menu: Menu;
  private videoRecorder: VideoRecorderLike | null = null;
  private recElapsedMs = 0;
  private cueCount = 0;
  private drillCount = 0;
  private recTimerHandle: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private characterState: CharacterState;
  private overlayLog: OverlayEventLog | null = null;
  private diagnostics: DiagnosticsLog | null = null;
  private activeTab: NavTab = "train";
  // E4: the active member's ファイト コメント, snapshotted at session start so it's
  // stable for the whole practice. "" → fall back to the generic encourage toast.
  private fightComment = "";
  // Preset currently reflected in the setup screen's dropdown (undefined = none picked).
  private selectedPresetId: string | undefined;

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    // Family-shared base storage (member list + classes/presets live here).
    // Per-member data is read/written through mem() (scoped by active member).
    this.clampActiveMember();
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

  // The household plan's limits (one plan covers every member).
  private limits(): PlanLimits {
    return PLAN_LIMITS[loadPlan(this.base())];
  }

  // Plan-derived 工夫 cap (0 = 工夫 disabled).
  private kufuLimit(): number {
    return this.limits().kufu;
  }

  // Plan-derived cap on how many DISTINCT 種目 may have a saved 工夫 at once
  // (Free plan: 1; Premium/Family: unlimited).
  private maxKufuDrills(): number {
    return this.limits().maxKufuDrills;
  }

  // Cap on the family-shared presets (menus).
  private familyPresetLimit(): number {
    return this.limits().presets;
  }

  // Members the plan lets the household use: the first N in the list. Extra
  // members (e.g. after Family lapses) keep their data but stay locked until
  // the household upgrades or removes someone.
  private usableMembers(): Member[] {
    return loadMembers(this.base()).slice(0, this.limits().members);
  }

  // Keep the active member inside the usable set.
  private clampActiveMember(): void {
    const base = this.base();
    const usable = this.usableMembers();
    if (!usable.some((m) => m.id === getActiveId(base))) setActive(usable[0].id, base);
  }

  // The assigned class (preset) id for a member, or null if unassigned or the
  // assigned preset was deleted family-wide. Validated against the shared
  // preset list so a dangling record never drives a menu.
  private assignedClassFor(memberId: string): string | null {
    const base = this.base();
    return getAssignedClass(loadPresets(base), scopedStorage(base, memberId));
  }

  // The active member's assigned class name (for the setup-screen label), or
  // null when unassigned.
  private activeClassName(): string | null {
    const id = this.assignedClassFor(getActiveId(this.base()));
    if (!id) return null;
    return loadPresets(this.base()).find((p) => p.id === id)?.name ?? null;
  }

  // Assign (or clear, when id is null) a member's class. Assigning also copies
  // the class's menu into that member's working menu as a starting point — the
  // kid can still edit/save it afterward. Clearing leaves the menu untouched.
  private assignClass(memberId: string, presetId: string | null): void {
    const base = this.base();
    const memStorage = scopedStorage(base, memberId);
    setAssignedClass(presetId, memStorage);
    if (presetId !== null) {
      const preset = loadPresets(base).find((p) => p.id === presetId);
      if (preset) saveMenu(structuredClone(preset.menu), memStorage);
    }
    // If the class was assigned to the active member, refresh the working menu.
    if (memberId === getActiveId(base)) this.menu = loadMenu(this.mem());
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
      selectedPresetId: this.selectedPresetId,
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
        this.selectedPresetId = id;
        this.showSetup();
      },
      onDeletePreset: (id) => {
        deletePreset(id, this.base());
        if (this.selectedPresetId === id) this.selectedPresetId = undefined;
        this.showSetup();
      },
      bgmMuted: this.deps.bgm ? getBgmMuted(this.base()) : undefined,
      onToggleBgm: this.deps.bgm
        ? () => {
            const next = !getBgmMuted(this.base());
            setBgmMuted(next, this.base());
            this.deps.bgm?.setMuted(next);
            this.showSetup();
          }
        : undefined,
      characterId: this.characterState.selectedId,
      onSelectCharacter: (id: CharacterId) => {
        this.characterState.selectedId = id;
        saveCharacterState(this.characterState, this.mem());
        this.showSetup();
      },
      characterState: this.characterState,
      belt: loadBelt(this.mem()),
      // E3: the active member's assigned くらす name (read-only label).
      className: this.activeClassName(),
      // E4: the parent's 感想コメント for the active member (top banner).
      kansou: loadComments(this.mem()).kansou,
      // Member band: kids pick who is practicing, ungated. The 家族 tab keeps
      // its parental gate for adding/removing members and changing plans.
      members: this.usableMembers(),
      activeMemberId: getActiveId(this.base()),
      onSelectMember: (id) => {
        if (!this.usableMembers().some((m) => m.id === id)) return;   // locked by plan
        setActive(id, this.base());
        this.reloadForActiveMember();
        this.showSetup();
      },
      // 工夫 written by the kid from the 💡 button on each row. Same store and
      // plan caps as the done screen, so they apply identically.
      kufuEnabled: this.kufuLimit() > 0,
      latestKufuFor: (name) => latestKufu(name, this.mem()),
      canAddKufuFor: (name) => canAddKufu(name, this.mem(), this.maxKufuDrills()),
      onSaveKufu: (name, text) => { addKufu(name, text, this.mem(), this.kufuLimit(), this.maxKufuDrills()); },
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
    const members = loadMembers(base);
    renderFamilyScreen(this.root, {
      members,
      activeId: getActiveId(base),
      memberCap: this.limits().members,
      onAddMember: (name) => {
        if (members.length >= this.limits().members) return;   // plan's kid limit
        addMember(name, base); this.reloadForActiveMember(); this.showFamily();
      },
      onRemoveMember: (id) => {
        removeMember(id, base); this.clampActiveMember(); this.reloadForActiveMember(); this.showFamily();
      },
      onSelectMember: (id) => {
        if (!this.usableMembers().some((m) => m.id === id)) return;   // locked by plan
        setActive(id, base); this.reloadForActiveMember(); this.showFamily();
      },
      activePlan: loadPlan(base),
      onSelectPlan: (plan) => { this.changePlan(plan); this.showFamily(); },
      // E3: くらす assignment. Classes are the family-shared presets; each
      // member's assignment maps memberId → presetId (or null when unassigned).
      classes: loadPresets(base),
      assignments: Object.fromEntries(members.map((m) => [m.id, this.assignedClassFor(m.id)])),
      onAssignClass: (memberId, presetId) => { this.assignClass(memberId, presetId); this.showFamily(); },
      // 帯: parents can set any member's belt directly (the meter starts over).
      belts: Object.fromEntries(members.map((m) => [m.id, loadBelt(scopedStorage(base, m.id)).index])),
      onSetBelt: (memberId, index) => { setBelt(index, scopedStorage(base, memberId)); this.showFamily(); },
      // E4: 応援コメント for the active member (per-member via mem()). Free on
      // every plan. Saving re-renders so the input reflects the trimmed value.
      comments: loadComments(this.mem()),
      onSaveComment: (kind, text) => { saveComment(kind, text, this.mem()); this.showFamily(); },
    });
  }

  // Set the household plan and enforce the new caps immediately
  // (delete-on-downgrade): trim every member's 工夫 history and the
  // family-shared presets to the plan, and move the active member back inside
  // the plan's kid limit. Members over the limit are locked, never deleted.
  private changePlan(plan: Plan): void {
    setPlan(plan, this.base());
    this.trimKufuToLimit();
    this.trimPresetsToFamilyLimit();
    this.clampActiveMember();
    this.reloadForActiveMember();
  }

  // Drop every member's 工夫 history down to the plan caps (0 clears all; a
  // lower maxKufuDrills also drops whole 種目 down to that count).
  private trimKufuToLimit(): void {
    const base = this.base();
    const { kufu, maxKufuDrills } = this.limits();
    loadMembers(base).forEach((m) => trimKufuHistory(kufu, scopedStorage(base, m.id), maxKufuDrills));
  }

  // Trim family-shared presets to the plan's cap.
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
    // Snapshot the active member's ファイト コメント for this session (E4). Used in
    // place of the generic encourage toast when the parent has written one.
    this.fightComment = loadComments(this.mem()).fight;

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

    // Record the raw camera+audio stream directly — no live canvas
    // compositing, so none of the iOS Safari canvas.captureStream()
    // freeze/silent-audio bugs can occur. Overlay text is logged with
    // timestamps here and burned into the file afterward (finishSession()).
    this.overlayLog = new OverlayEventLog();
    this.overlayLog.start();
    await recorder.startRecording();

    // Temporary on-device diagnostics for the iPhone Safari video-freeze bug
    // (image stalls while audio keeps recording). No Mac is available for
    // Safari's remote inspector, so this logs track mute/ended events, tab
    // visibility changes, and rAF stalls as plain text shown on the done
    // screen — readable directly off the phone.
    this.diagnostics = new DiagnosticsLog();
    this.diagnostics.start();
    this.diagnostics.watchStream(stream);
    // track mute/ended and rAF stalls are both upstream of MediaRecorder's
    // encoding — neither fires when the recorded video freezes but the raw
    // track and preview loop stay healthy. Poll the live preview's
    // currentTime instead, since that reflects real decoded-frame progress.
    // Native records through AVFoundation, so startCamera() hands back an empty
    // MediaStream and the preview <video> never advances. Polling it there
    // would log a "stalled" line every second and drown the real signal.
    // Optional call: test doubles hand back a minimal stream stub, and the
    // native path's empty MediaStream has no video tracks either.
    if ((stream.getVideoTracks?.() ?? []).length > 0) {
      this.diagnostics.watchVideoElement(view.videoEl);
    }

    this.recElapsedMs = 0;
    this.cueCount = 0;
    this.drillCount = 0;
    this.paused = false;
    view.setPaused(false);
    this.deps.bgm?.setMuted(getBgmMuted(this.base()));
    view.setBgmMuted(this.deps.bgm?.isMuted() ?? false);

    // Ready → 3 → 2 → 1 → Go!! intro. Numbers beep, Ready/Go are spoken.
    // BGM and the drill timer both start on "Go!!".
    await playCountdownIntro(this.root, {
      stepMs: this.deps.introStepMs,
      onBeat: (cue) => {
        // Burned into the recording too, so the video opens with the same
        // Ready → 3 → 2 → 1 → Go!! the child saw on screen.
        this.overlayLog?.setState({ intro: cue });
        if (cue === "Ready") void this.deps.audioSink.speak("よーい");
        else if (cue === "Go!!") void this.deps.audioSink.speak("はじめ");
        else void this.deps.audioSink.beep();
      },
    });

    this.overlayLog?.setState({ intro: "" });
    this.deps.bgm?.play();
    if (this.deps.bgm) {
      this.overlayLog?.logSound({
        kind: "bgm", playing: !this.deps.bgm.isMuted(), restart: true, src: this.deps.bgm.src,
      });
    }
    this.startRecTimer(view);

    const cuePlayer = new CuePlayer(this.deps.voiceStore, this.deps.audioSink);

    const handlers: SchedulerHandlers = {
      onDrillStart: (drill: Drill, index: number, total: number) => {
        this.drillCount = index + 1;
        view.setDrill(drill, index + 1, total);
        // Show + burn the drill name and its saved 工夫 reminder.
        const caption = this.captionFor(drill);
        view.setCaption(caption);
        this.overlayLog?.setState({ drill: drill.name, caption, drillIndex: index });
        void cuePlayer.announce();
        const next = this.menu[index + 1];
        view.setNext(next ? next.name : null);
      },
      onTick: (secondsLeft: number) => {
        view.setTime(secondsLeft);
        this.overlayLog?.setState({ seconds: secondsLeft });
      },
      onEncourage: () => {
        this.cueCount++;
        // E4: the parent's ファイト コメント, when set, is shown and burned in.
        // The generic 「ファイト！」 toast is gone: it predates the talking
        // characters and only repeated what the speech bubble already says.
        const cue = this.fightComment;
        const clip = view.showCue(cue);
        if (clip) {
          this.deps.playCheerVoice?.(clip.audio);
          this.overlayLog?.logSound({ kind: "clip", src: clip.audio });
        }
        if (cue) {
          this.overlayLog?.setState({ cue });
          setTimeout(() => this.overlayLog?.setState({ cue: "" }), 1800);
        }
        // The character's own voice is the encouragement now. Playing the
        // generic cue as well was the stray extra voice heard during cheers.
        if (!clip) void cuePlayer.encourage();
      },
      onCountdown: (n: number) => {
        this.cueCount++;
        void cuePlayer.countdown(n);
      },
      onDrillEnd: () => { /* no-op */ },
      onSessionEnd: () => { void this.finishSession(true); },
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
    // 終了 partway: the video is still saved, but nothing counts toward progress.
    view.onStop(() => { void this.finishSession(false); });
    view.onToggleBgm(() => {
      const next = !(this.deps.bgm?.isMuted() ?? false);
      this.deps.bgm?.setMuted(next);
      this.overlayLog?.logSound({ kind: "bgm", playing: !next });
      setBgmMuted(next, this.base());
      view.setBgmMuted(next);
    });

    this.scheduler = scheduler;
    scheduler.start();
    // Started here, not alongside the rest of diagnostics setup above — the
    // heartbeat has no way to distinguish "rAF hasn't started yet" from
    // "rAF stalled," so starting it before the ~3.5s Ready→Go intro produced
    // false-positive "rAF silent" warnings for the entire intro duration.
    this.diagnostics?.startHeartbeat();
    this.deps.rafLoop.start((deltaMs) => {
      this.diagnostics?.noteRafTick();
      scheduler.tick(deltaMs);
    });
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

  // completed: the menu ran to its end (true) or was stopped with 終了 (false).
  private async finishSession(completed: boolean): Promise<void> {
    if (this.sessionEnding) return;
    this.sessionEnding = true;

    this.scheduler?.stop();
    this.deps.rafLoop.stop();
    this.stopRecTimer();
    this.deps.bgm?.stop();
    this.overlayLog?.logSound({ kind: "bgm", playing: false });

    try {
      // Capture events AND elapsed time from the same OverlayEventLog instance,
      // on its own clock, before nulling it out. recElapsedMs (driven by
      // startRecTimer(), which starts AFTER the Ready→Go intro) undercounts the
      // true recording length by the intro's duration — using it here would
      // anchor totalDurationMs on a different clock than the event timestamps
      // (which start at overlayLog.start(), before the intro), silently
      // dropping every trailing overlay segment during burn-in. See
      // overlay-event-log.ts's elapsedMs() and overlay-burner.ts's toSegments().
      const events = this.overlayLog?.getEvents() ?? [];
      const sounds = this.overlayLog?.getSounds() ?? [];
      const recordedDurationMs = Math.floor(this.overlayLog?.elapsedMs() ?? 0);
      this.overlayLog = null;
      this.diagnostics?.stop();
      const diagnosticsText = this.diagnostics?.format() ?? "";
      this.diagnostics = null;

      const recorder = this.videoRecorder;
      // On native, stop() also burns the overlay text into the video before it
      // returns, which takes several seconds. Without this the training screen
      // just froze after 終了 with no sign anything was happening.
      renderLoadingScreen(this.root, "動画を保存中…");
      const menu: OverlayMenuItem[] = this.menu.map(({ name, seconds, kind }) => ({ name, seconds, kind }));
      const blob = recorder ? await recorder.stop(events, recordedDurationMs, menu, sounds) : new Blob();
      await this.deps.wakeGuard.release();

      const ext = recorder ? recorder.fileExtension() : "webm";
      const videoUrl = URL.createObjectURL(blob);
      // burnOverlay() only calls onError on failure, so resolveBurnInError(null)
      // covers both "succeeded" and "no burnOverlay dep at all" once the burn-in
      // promise settles without having already reported a failure message.
      let resolveBurnInError!: (message: string | null) => void;
      const burnInErrorPromise = new Promise<string | null>((r) => { resolveBurnInError = r; });
      const burnInPromise = this.deps.burnOverlay
        ? this.deps.burnOverlay(blob, events, recordedDurationMs, ext, resolveBurnInError)
        : Promise.resolve(null);
      void burnInPromise.then(() => resolveBurnInError(null));

      const elapsedSeconds = Math.floor(this.recElapsedMs / 1000);

      // Deduped list of the drills practiced this session (rest excluded), each
      // with its latest saved 工夫 pre-filled for editing.
      const seen = new Set<string>();
      const kufuDrills = this.menu
        .filter((d) => d.kind !== "rest" && !seen.has(d.name) && seen.add(d.name))
        .map((d) => ({
          name: d.name,
          current: latestKufu(d.name, this.mem()),
          canAdd: canAddKufu(d.name, this.mem(), this.maxKufuDrills()),
        }));

      // Only a practice finished to the end counts: each practiced drill gets
      // +1 toward its 強さ level and the belt meter fills one bar.
      let beltResult = { completed, bars: 0, promotedTo: null as string | null };
      if (completed) {
        bumpDrills(kufuDrills.map((d) => d.name), this.mem());
        const { state, promoted } = addSessionBar(this.mem());
        beltResult = { completed, bars: state.bars, promotedTo: promoted ? BELTS[state.index].name : null };
      }

      const blobForShare = blob;
      const shareFileUri = recorder?.fileUri?.() ?? null;
      renderDoneScreen(this.root, {
        videoUrl,
        ext,
        burnInPromise,
        burnInErrorPromise,
        diagnosticsText,
        stats: {
          time: formatMMSS(elapsedSeconds),
          drills: this.drillCount,
          cues: this.cueCount,
        },
        characterId: this.characterState.selectedId,
        beltResult,
        kufuDrills,
        kufuEnabled: this.kufuLimit() > 0,
        onSaveKufu: (name, text) => { addKufu(name, text, this.mem(), this.kufuLimit(), this.maxKufuDrills()); },
        onShare: (burnedBlob) => {
          void this.deps.shareRecording(burnedBlob ?? blobForShare, ext, shareFileUri).catch((e) => {
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
    } catch (e) {
      // Without this, a thrown/rejected step above (e.g. recorder.stop()
      // rejecting on an already-inactive MediaRecorder) left finishSession()
      // never reaching renderDoneScreen() — the 終了 button appeared to do
      // nothing and the training screen stayed up with no visible error.
      console.error("finishSession failed", e);
      this.diagnostics = null;
      this.overlayLog = null;
      this.sessionEnding = false;
      this.videoRecorder = null;
      this.scheduler = null;
      const message = e instanceof Error ? e.message : String(e);
      this.showSetup(`動画の保存に失敗しました: ${message}`);
    }
  }
}
