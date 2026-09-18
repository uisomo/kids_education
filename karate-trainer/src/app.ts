import type { Menu, Drill } from "./types";
import { loadMenu, saveMenu, formatMMSS, totalSeconds, MAX_RECORD_SECONDS, recordingBytesNeeded } from "./menu-store";
import { type Preset, BASIC_PRESET, BASIC_PRESET_ID, loadPresets, savePreset, deletePreset, updatePreset } from "./preset-store";
import { SessionScheduler, type SchedulerHandlers } from "./scheduler";
import { CuePlayer, type CueSink, type ClipSource } from "./cue-player";
import type { VoiceStore } from "./voice-store";
import { renderSetupScreen } from "./ui/setup-screen";
import { renderTrainingScreen, type TrainingView } from "./ui/training-screen";
import { renderDoneScreen, type BeltMissReason, type DoneBeltResult } from "./ui/done-screen";
import { renderVoiceScreen } from "./ui/voice-screen";
import { COUNTDOWN_SOUNDS, playCountdownIntro } from "./ui/countdown-intro";
import { renderLoadingScreen } from "./ui/loading-screen";
import {
  latestKufu, kufuNotes, addKufu, canAddKufu, removeKufu, removeKufuAt, clearAllKufu, countKufu,
  renameKufu, pruneKufu, type KufuCaps,
} from "./kufu-store";
import { BELTS, beltLabel } from "./belt-store";
import { currentStreak, recordPracticeDay, setStreakDays } from "./streak-store";
import {
  loadMenuBelt, beltStateFor, recordPractice, setMenuBelt, removeMenuBelt, levelOf,
  getSelectedPreset, setSelectedPreset, setDrillLevel, drillNames,
} from "./menu-belt-store";
import { renderStrengthScreen } from "./ui/strength-screen";
import { renderFamilyScreen, type BillingView, type TestToolsView } from "./ui/family-screen";
import { createBottomNav, type NavTab } from "./ui/bottom-nav";
import { scopedStorage } from "./scoped-storage";
import { type Member, getActiveId, loadMembers, addMember, removeMember, renameMember, setActive } from "./member-store";
import { type Plan, type PlanLimits, PLAN_LIMITS, PLAN_META, loadPlan, setPlan } from "./plan-store";
import { type Decor, canRemoveDecor, effectiveDecor, loadDecor, setDecor } from "./decor-store";
import { type Billing, type BillingInfo, type ProductId, planOfProduct, renewalText } from "./billing";
import { getAssignedClass, setAssignedClass } from "./class-store";
import { getBgmMuted, setBgmMuted } from "./bgm-store";
import { loadComments, saveComment } from "./comment-store";
import { getShareAllowed, setShareAllowed } from "./share-setting-store";
import { renderParentalGate, askParentalGate } from "./parental-gate";
import {
  loadCharacterState,
  saveCharacterState,
  type CharacterId,
  type CharacterState,
} from "./character-store";
import { OverlayEventLog, type OverlayEvent, type OverlayMenuItem, type SoundEvent } from "./overlay-event-log";
import { DiagnosticsLog } from "./diagnostics-log";
import { openSavedVideoModal } from "./ui/saved-video-modal";
import { COPY, IS_PIANO } from "./flavor";

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
    labels?: { streakLabel?: string; beltLabel?: string; menuName?: string; decor?: string },
  ): Promise<Blob>;
  fileExtension(): string;
  // Native only: bytes free on the phone, or null when unknown.
  freeDiskBytes?(): Promise<number | null>;
  // Native only: the finished file on disk, for handing to the OS share sheet
  // without round-tripping the video through base64.
  fileUri?(): string | null;
  // Native only: a URL the <video> can stream the video from, so the whole
  // recording is never loaded into the web view's memory. Right after stop()
  // it is the bare capture; once saved() resolves, the finished video.
  playbackUrl?(): string | null;
  // Native only: the overlay and sound are added after stop() returns. Resolves
  // with the finished video (null if there is nothing to wait for).
  saved?(onProgress?: (fraction: number) => void): Promise<{ playbackUrl: string; fileUri: string } | null>;
  // Native only: the finished video was on screen, so it isn't offered again.
  markSeen?(): void;
  // Tear down camera / mic / music without exporting (a failed start or a
  // failed stop). Never rejects.
  cancel?(): Promise<void>;
  // The phone stopped the recording itself (call, app switch, camera taken).
  onInterrupted?(cb: (reason: string) => void): void;
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

// Native: the save queue behind the recorder (see NativeSaveTracker), for a
// video that finished — or is still being finished — after the app was
// reopened. Absent on the web.
export interface SavedVideosLike {
  status(): Promise<{
    saving: { jobId: string; progress: number; resumed: boolean } | null;
    unseen: { jobId: string; uri: string; createdAt: number }[];
  } | null>;
  watch(jobId: string, onProgress?: (fraction: number) => void): Promise<{ jobId: string; uri: string }>;
  markSeen(jobId: string): Promise<void>;
  playbackUrl(uri: string): string;
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
  // Plays a short sound effect file (countdown ぷっ / ぷーん). Native uses the
  // same engine as the cheer voices, so the export can mix it into the video.
  // Absent → the countdown falls back to audioSink.beep().
  playEffect?(src: string): void;
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
  // Yes/no question (plan downgrade). Defaults to window.confirm.
  confirm?(message: string): boolean;
  // Opens this app's page in iOS Settings (camera / mic permission denied).
  openSettings?(): void;
  // Hands a file to the OS share sheet (voice backup export on native).
  exportFile?(filename: string, blob: Blob): Promise<void>;
  // Parental gate before anything leaves the app (sharing the video). Defaults
  // to the overlay gate; tests inject a stub.
  askParentalGate?(root: HTMLElement): Promise<boolean>;
  savedVideos?: SavedVideosLike;
  // App Store subscriptions (iOS app). When set, the plan follows what Apple
  // says was bought; without it (web, tests) the plan cards set it directly.
  billing?: Billing;
  // test アプリ (test-mode.ts): the 家族 tab shows テスト用 controls for the
  // streak and each drill's level.
  testTools?: boolean;
}


export class KarateApp {
  private menu: Menu;
  private videoRecorder: VideoRecorderLike | null = null;
  private recElapsedMs = 0;
  private cueCount = 0;
  // Drills (not 休憩) that ran down to 0 this session, in order, and their menu
  // rows. Only these raise 強さ (and so the menu's belt); skipped drills don't.
  private finishedDrills: string[] = [];
  private finishedRows = new Set<number>();
  private currentRow = -1;
  private recTimerHandle: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private characterState: CharacterState;
  private overlayLog: OverlayEventLog | null = null;
  private diagnostics: DiagnosticsLog | null = null;
  private activeTab: NavTab = "train";
  // Object URL made for the done screen's <video>, revoked when leaving it.
  private doneVideoUrl: string | null = null;
  // Removes the session's visibilitychange listener.
  private detachVisibility: (() => void) | null = null;

  constructor(private root: HTMLElement, private deps: KarateAppDeps) {
    // Family-shared base storage (member list + classes/presets live here).
    // Per-member data is read/written through mem() (scoped by active member).
    this.clampActiveMember();
    if (!deps.menuOverride) this.ensureStarterMenu();
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

  // Plan-derived 工夫 caps: per 種目, and in total for the member.
  private kufuCaps(): KufuCaps {
    const l = this.limits();
    return { perDrill: l.kufuPerDrill, total: l.kufuTotal };
  }

  // Cap on the family-shared presets (menus): so many per usable kid.
  private familyPresetLimit(): number {
    return this.limits().presetsPerMember * this.usableMembers().length;
  }

  // The presets the plan lets the household use: built-in 基本, then the oldest
  // N saved ones. Extras (after a downgrade) stay stored, locked, and come back
  // on upgrade.
  private usablePresets(): Preset[] {
    const saved = loadPresets(this.base());
    // A family that already saved its own 「基本」 sees the built-in one as
    // 「基本（標準）」 so the dropdown never shows two identical names.
    const basic = saved.some((p) => p.name === BASIC_PRESET.name) ? { ...BASIC_PRESET, name: "基本（標準）" } : BASIC_PRESET;
    return [basic, ...saved.slice(0, this.familyPresetLimit())];
  }

  // A kid who has never touched a menu starts on 基本, picked, so their very
  // first practice already fills its 帯 and 強さ. Anyone with a menu or a
  // choice of their own keeps it.
  private ensureStarterMenu(): void {
    const mem = this.mem();
    if (mem.getItem("karate.menu") !== null || getSelectedPreset(mem) !== null) return;
    saveMenu(structuredClone(BASIC_PRESET.menu), mem);
    setSelectedPreset(BASIC_PRESET_ID, mem);
  }

  // The saved menu the active member practices: the dropdown shows it and its
  // 帯 / 強さ fill. Remembered per member; null when none is picked (or the
  // plan locked it).
  // How many real 種目 the menu has, and which one we are on. During a 休憩 the
  // number stays on the drills finished so far rather than jumping.
  private drillTotal(): number {
    return this.menu.filter((d) => d.kind !== "rest").length;
  }

  private drillNumberAt(index: number): number {
    const done = this.menu.slice(0, index).filter((d) => d.kind !== "rest").length;
    return this.menu[index]?.kind === "rest" ? done : done + 1;
  }

  private linkedPreset(): Preset | null {
    const id = getSelectedPreset(this.mem());
    return id ? this.usablePresets().find((p) => p.id === id) ?? null : null;
  }

  private confirm(message: string): boolean {
    if (this.deps.confirm) return this.deps.confirm(message);
    // jsdom's unimplemented confirm returns undefined: treat as yes.
    return typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(message) !== false
      : true;
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
    return getAssignedClass(this.usablePresets(), scopedStorage(base, memberId));
  }

  // The active member's assigned class name (for the setup-screen label), or
  // null when unassigned.
  private activeClassName(): string | null {
    const id = this.assignedClassFor(getActiveId(this.base()));
    if (!id) return null;
    return this.usablePresets().find((p) => p.id === id)?.name ?? null;
  }

  // Assign (or clear, when id is null) a member's class. Assigning also copies
  // the class's menu into that member's working menu as a starting point — the
  // kid can still edit/save it afterward. Clearing leaves the menu untouched.
  private assignClass(memberId: string, presetId: string | null): void {
    const base = this.base();
    const memStorage = scopedStorage(base, memberId);
    setAssignedClass(presetId, memStorage);
    if (presetId !== null) {
      const preset = this.usablePresets().find((p) => p.id === presetId);
      if (preset) {
        saveMenu(structuredClone(preset.menu), memStorage);
        setSelectedPreset(presetId, memStorage);   // the class menu's belt fills
      }
    }
    // If the class was assigned to the active member, refresh the working menu.
    if (memberId === getActiveId(base)) this.menu = loadMenu(this.mem());
  }

  private savedVideoOpen = false;
  // Closed this launch without being finished; not offered again until the
  // next launch.
  private savedVideoDismissed = new Set<string>();

  // A video nobody saw — the app was killed while saving it and the save was
  // finished on this launch — or such a save still running: offered on the
  // 今日の稽古 screen so the practice isn't lost from the child's view.
  private async offerSavedVideo(): Promise<void> {
    const saves = this.deps.savedVideos;
    if (!saves || this.savedVideoOpen) return;
    this.savedVideoOpen = true;
    let opened = false;
    try {
      const status = await saves.status();
      // Only over the setup screen: never on top of a practice that started meanwhile.
      if (!status || !this.root.classList.contains("setup")) return;
      const unseen = status.unseen.filter((v) => !this.savedVideoDismissed.has(v.jobId));
      const latest = unseen[unseen.length - 1];
      // A save from this launch that is still running turns up as unseen once
      // done; only one resumed after a crash is shown while it runs.
      const resumed = !latest && status.saving?.resumed && !this.savedVideoDismissed.has(status.saving.jobId)
        ? status.saving : null;
      if (!latest && !resumed) return;

      const jobId = latest?.jobId ?? resumed!.jobId;
      let fileUri: string | null = latest?.uri ?? null;
      const progressFns: ((fraction: number) => void)[] = [];
      const done = resumed
        ? saves.watch(resumed.jobId, (f) => progressFns.forEach((fn) => fn(f))).then((r) => {
          fileUri = r.uri;
          return { playbackUrl: saves.playbackUrl(r.uri) };
        })
        : null;
      const share = () => fileUri
        ? this.deps.shareRecording(new Blob(), fileUri.toLowerCase().endsWith(".mov") ? "mov" : "mp4", fileUri)
        : Promise.resolve();
      const host = this.root.ownerDocument.body;
      opened = true;
      openSavedVideoModal(host, {
        ready: latest ? { playbackUrl: saves.playbackUrl(latest.uri) } : undefined,
        saving: resumed && done
          ? { progress: resumed.progress, onProgress: (fn) => { progressFns.push(fn); }, done }
          : undefined,
        shareAllowed: getShareAllowed(this.mem()),
        onSave: () => {
          const gate = this.deps.askParentalGate ?? askParentalGate;
          void gate(host).then((ok) => (ok ? share() : undefined))
            .catch((e) => console.error("shareRecording failed", e));
        },
        onSend: () => { void share().catch((e) => console.error("shareRecording failed", e)); },
        onShown: () => { void saves.markSeen(jobId); },
        onClose: () => {
          this.savedVideoOpen = false;
          this.savedVideoDismissed.add(jobId);
        },
      });
    } catch (e) {
      console.warn("offerSavedVideo failed", e);
    } finally {
      if (!opened) this.savedVideoOpen = false;
    }
  }

  async start(): Promise<void> {
    this.showSetup();
    const billing = this.deps.billing;
    if (billing) {
      billing.onChange((info) => this.applyBilling(info));
      void this.syncBilling();
    }
  }

  // action: an optional button under the message (e.g. open iOS Settings).
  private showSetup(message?: string, action?: { label: string; run(): void }): void {
    // A subscription change that arrived during a practice applies here.
    if (this.pendingPlan) {
      const plan = this.pendingPlan;
      this.pendingPlan = null;
      if (plan !== loadPlan(this.base())) this.changePlan(plan);
    }
    // Notes left behind by rows deleted/renamed in older builds would hold the
    // Free plan's 工夫 slot forever; keep only names some menu still uses.
    pruneKufu([
      ...this.menu.map((d) => d.name),
      ...[BASIC_PRESET, ...loadPresets(this.base())].flatMap((p) => p.menu.map((d) => d.name)),
    ], this.mem());
    void this.offerSavedVideo();
    const linked = this.linkedPreset();
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
      presets: this.usablePresets(),
      selectedPresetId: linked?.id,
      onSavePreset: () => {
        const ask = this.deps.promptName
          ?? ((d: string) => (typeof window !== "undefined" ? window.prompt("メニュー名", d) : null));
        const name = ask("新しいメニュー")?.trim();
        if (!name) return;
        const atLimit = loadPresets(this.base()).length >= this.familyPresetLimit();
        const saved = savePreset(name, this.menu, this.base(), this.familyPresetLimit());
        if (saved) setSelectedPreset(saved.id, this.mem());
        this.showSetup(saved ? undefined
          : atLimit ? "プランの上限です。上書き保存するか、アップグレードしてね"
            : "保存できませんでした（端末の空き容量を確認してください）");
      },
      onOverwritePreset: (id) => {
        if (id === BASIC_PRESET_ID) return;   // 基本 is read-only; 保存 makes a copy
        const ok = updatePreset(id, this.menu, this.base());
        this.showSetup(ok ? "メニューを上書き保存しました" : "保存できませんでした（端末の空き容量を確認してください）");
      },
      onLoadPreset: (id) => {
        const preset = this.usablePresets().find((p) => p.id === id);
        if (!preset) return;
        this.menu = structuredClone(preset.menu);
        saveMenu(this.menu, this.mem());
        setSelectedPreset(id, this.mem());
        this.showSetup();
      },
      onNewMenu: () => {
        setSelectedPreset(null, this.mem());
        this.showSetup();
      },
      onDeletePreset: (id) => {
        if (id === BASIC_PRESET_ID) return;   // 基本 can't be deleted
        deletePreset(id, this.base());
        // Every member's belt for that menu goes with it.
        for (const m of loadMembers(this.base())) {
          const s = scopedStorage(this.base(), m.id);
          removeMenuBelt(id, s);
          if (getSelectedPreset(s) === id) setSelectedPreset(null, s);
        }
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
      // The picked saved menu's 帯 (bars = its lowest drill level).
      belt: linked ? beltStateFor(loadMenuBelt(linked.id, this.mem()), linked.menu) : undefined,
      beltHint: `メニューを保存すると、${COPY.belt}と強さがたまるよ`,
      // E3: the active member's assigned menu name (read-only label).
      className: this.activeClassName(),
      // E4: the parent's 感想コメント for the active member (top banner).
      kansou: loadComments(this.mem()).kansou,
      kansouBy: loadComments(this.mem()).kansouBy,
      streakDays: currentStreak(this.mem()),
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
      kufuEnabled: this.kufuCaps().perDrill > 0,
      kufuPerDrill: this.kufuCaps().perDrill,
      kufuFor: (name) => kufuNotes(name, this.mem(), this.kufuCaps()),
      canAddKufuFor: (name) => canAddKufu(name, this.mem(), this.kufuCaps()),
      onAddKufu: (name, text) => { addKufu(name, text, this.mem(), this.kufuCaps()); },
      onRemoveKufu: (name, index) => removeKufuAt(name, index, this.mem()),
      // Once the card closes, re-render so every row's 💡 reflects the change.
      onKufuChanged: () => this.showSetup(),
      // Row deletion re-renders through onChange right after.
      onDeleteKufu: (name) => removeKufu(name, this.mem()),
      onRenameKufu: (from, to) => { renameKufu(from, to, this.mem()); this.showSetup(); },
    });

    if (message) {
      const note = document.createElement("div");
      note.dataset.setupStatus = "";
      note.className = "setup-status";
      note.setAttribute("role", "alert");
      note.textContent = message;
      if (action) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "setup-status-action";
        btn.dataset.setupStatusAction = "";
        btn.textContent = action.label;
        btn.addEventListener("click", () => action.run());
        note.append(" ", btn);
      }
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
        // The gate covers one visit: leaving 家族 locks it again.
        if (this.activeTab === "family") { this.familyUnlocked = false; this.billingStatus = ""; }
        if (tab === "train") this.showSetup();
        else if (tab === "strength") this.showStrength();
        else this.showFamily();
      },
    });
    this.root.append(nav);
  }

  private showStrength(): void {
    renderStrengthScreen(this.root, {
      storage: this.mem(), menus: this.usablePresets(), selectedId: this.linkedPreset()?.id,
    });
    this.mountTabNav("strength");
  }

  private familyUnlocked = false;

  private showFamily(): void {
    // Gate the 家族 tab once per session so kids can't change members/plans.
    if (!this.familyUnlocked) {
      renderParentalGate(this.root, {
        onPass: () => {
          this.familyUnlocked = true;
          // Prices that failed to load (offline) get another try each visit.
          if (this.deps.billing && this.prices && Object.keys(this.prices).length === 0) void this.syncBilling();
          this.showFamily();
        },
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
        // Removing deletes that child's belt, 強さ, 工夫 and menu for good.
        const name = members.find((m) => m.id === id)?.name ?? "";
        if (!this.confirm(`「${name}」を削除すると、${COPY.belt}・強さ・工夫などの記録もすべて消えます。削除しますか？`)) return;
        removeMember(id, base); this.clampActiveMember(); this.reloadForActiveMember(); this.showFamily();
      },
      onSelectMember: (id) => {
        if (!this.usableMembers().some((m) => m.id === id)) return;   // locked by plan
        setActive(id, base); this.reloadForActiveMember(); this.showFamily();
      },
      onRenameMember: (id, name) => { renameMember(id, name, base); this.showFamily(); },
      activePlan: loadPlan(base),
      billing: this.deps.billing ? this.billingView(this.deps.billing) : undefined,
      onSelectPlan: (plan) => {
        if (this.deps.billing) return;   // plans are bought through Apple
        const cur = PLAN_LIMITS[loadPlan(base)];
        const next = PLAN_LIMITS[plan];
        const lower = next.members < cur.members || next.presetsPerMember < cur.presetsPerMember
          || next.kufuPerDrill < cur.kufuPerDrill || next.kufuTotal < cur.kufuTotal;
        if (lower && !this.confirm("プランを下げると、上限をこえたメンバー・メニュー・工夫は使えなくなります（データは消えず、プランを戻すとまた使えます）。変更しますか？")) return;
        this.changePlan(plan);
        this.showFamily();
      },
      // E3: くらす assignment. Classes are the family-shared presets; each
      // member's assignment maps memberId → presetId (or null when unassigned).
      classes: this.usablePresets(),
      assignments: Object.fromEntries(members.map((m) => [m.id, this.assignedClassFor(m.id)])),
      onAssignClass: (memberId, presetId) => { this.assignClass(memberId, presetId); this.showFamily(); },
      // 帯: one per saved menu for the active member; setting one starts its 強さ over.
      menuBelts: this.usablePresets().map((p) => ({ id: p.id, name: p.name, belt: loadMenuBelt(p.id, this.mem()).belt })),
      onSetMenuBelt: (presetId, index) => { setMenuBelt(presetId, index, this.mem()); this.showFamily(); },
      // E4: 応援コメント for the active member (per-member via mem()). Free on
      // every plan. Saving re-renders so the input reflects the trimmed value.
      comments: loadComments(this.mem()),
      onSaveComment: (kind, text) => { saveComment(kind, text, this.mem()); this.showFamily(); },
      // 「工夫をぜんぶけす」 for the active member.
      // LINE・SNS: which kids may send their videos out.
      shareAllowed: Object.fromEntries(members.map((m) => [m.id, getShareAllowed(scopedStorage(base, m.id))])),
      onSetShareAllowed: (memberId, allowed) => { setShareAllowed(allowed, scopedStorage(base, memberId)); this.showFamily(); },
      decor: loadDecor(base),
      canRemoveDecor: canRemoveDecor(loadPlan(base)),
      onSelectDecor: (decor: Decor) => { setDecor(decor, base); this.showFamily(); },
      testTools: this.deps.testTools ? this.testToolsView() : undefined,
      kufuCount: countKufu(this.mem()),
      onClearAllKufu: () => {
        const name = loadMembers(base).find((m) => m.id === getActiveId(base))?.name ?? "";
        if (!this.confirm(`${name} の工夫を ${countKufu(this.mem())}件 ぜんぶけします。いいですか？`)) return;
        clearAllKufu(this.mem());
        this.showFamily();
      },
    });
  }

  // test アプリ: the active member's streak and, per usable menu, each drill's
  // level. Every change re-renders so the numbers on screen are what's stored.
  private testToolsView(): TestToolsView {
    const menus = this.usablePresets().map((p) => {
      const mb = loadMenuBelt(p.id, this.mem());
      return { id: p.id, name: p.name, drills: drillNames(p.menu).map((name) => ({ name, level: levelOf(mb, name) })) };
    });
    return {
      streakDays: currentStreak(this.mem()),
      onSetStreak: (days) => { setStreakDays(days, this.mem()); this.showFamily(); },
      menus,
      onSetLevel: (presetId, drill, level) => { setDrillLevel(presetId, drill, level, this.mem()); this.showFamily(); },
      onSetAllLevels: (presetId, level) => {
        const preset = menus.find((m) => m.id === presetId);
        preset?.drills.forEach((d) => setDrillLevel(presetId, d.name, level, this.mem()));
        this.showFamily();
      },
    };
  }

  // Set the household plan. The new caps apply by locking, never deleting:
  // members, presets and 工夫 past the limit stay stored but unusable
  // (usableMembers / usablePresets / the kufu store's maxDrills) and come back
  // when the household upgrades again — which is also what an expired
  // subscription must do once real purchases exist.
  private changePlan(plan: Plan): void {
    setPlan(plan, this.base());
    this.clampActiveMember();
    this.reloadForActiveMember();
  }

  // --- App Store subscriptions (deps.billing) ---
  private prices: Partial<Record<ProductId, string>> | null = null;   // null = loading
  private billingInfo: BillingInfo | null = null;
  private billingBusy = false;
  private billingStatus = "";
  // Plan change that arrived mid-practice, applied at the next setup screen so
  // the active kid can't switch under a running session or its done screen.
  private pendingPlan: Plan | null = null;

  private async syncBilling(): Promise<void> {
    const billing = this.deps.billing!;
    const [info, prices] = await Promise.all([billing.refresh(), billing.prices()]);
    this.prices = prices;
    if (info) this.applyBilling(info);
    else this.refreshFamilyIfOpen();
  }

  // Apple's answer replaces the cached plan. Losing a plan locks what's past
  // the new caps (changePlan never deletes).
  private applyBilling(info: BillingInfo): void {
    this.billingInfo = info;
    if (info.plan !== loadPlan(this.base())) {
      if (this.videoRecorder) this.pendingPlan = info.plan;
      else this.changePlan(info.plan);
    }
    this.refreshFamilyIfOpen();
  }

  private refreshFamilyIfOpen(): void {
    if (this.activeTab === "family" && this.familyUnlocked && !this.videoRecorder) this.showFamily();
  }

  private billingView(billing: Billing): BillingView {
    return {
      prices: this.prices,
      currentProduct: this.billingInfo?.plan === "free" ? null : this.billingInfo?.productId ?? null,
      renewal: renewalText(this.billingInfo),
      busy: this.billingBusy,
      status: this.billingStatus,
      onBuy: (id) => { void this.buy(billing, id); },
      onRestore: () => { void this.restore(billing); },
      onManage: () => { void billing.manage(); },
      onChooseFree: () => {
        if (this.confirm("フリーにするには「サブスクリプションを管理」で自動更新を止めてください。いまの期間が終わるとフリーになります（データは消えません）。ひらきますか？")) {
          void billing.manage();
        }
      },
    };
  }

  private async buy(billing: Billing, id: ProductId): Promise<void> {
    if (this.billingBusy) return;
    this.billingBusy = true;
    this.billingStatus = "";
    this.refreshFamilyIfOpen();
    const out = await billing.purchase(id);
    this.billingBusy = false;
    const label = PLAN_META[planOfProduct(id)].label;
    if (out.status === "purchased") {
      // Apple applies an upgrade at once, but a downgrade or a 月⇄年 switch
      // only from the next renewal — the old subscription is still the one active.
      this.billingStatus = out.info.productId === id
        ? `${label}になりました。ありがとうございます！`
        : `${label}（${id.endsWith("_yearly") ? "年" : "月"}ごと）には、次の更新日から切りかわります`;
      this.applyBilling(out.info);
      return;
    }
    this.billingStatus = out.status === "pending"
      ? "購入の承認待ちです。承認されると自動で切りかわります"
      : out.status === "error"
        ? "購入できませんでした。通信を確認して、もう一度ためしてね"
        : "";
    if (out.status === "error") console.error("purchase failed", out.message);
    this.refreshFamilyIfOpen();
  }

  private async restore(billing: Billing): Promise<void> {
    if (this.billingBusy) return;
    this.billingBusy = true;
    this.billingStatus = "";
    this.refreshFamilyIfOpen();
    const info = await billing.restore();
    this.billingBusy = false;
    this.billingStatus = !info
      ? "復元できませんでした。通信を確認して、もう一度ためしてね"
      : info.plan === "free"
        ? "復元できる購入は見つかりませんでした"
        : `${PLAN_META[info.plan].label}を復元しました`;
    if (info) this.applyBilling(info);
    else this.refreshFamilyIfOpen();
  }

  private playEffect(src: string): void {
    if (!this.deps.playEffect) { void this.deps.audioSink.beep(); return; }
    this.deps.playEffect(src);
    this.overlayLog?.logSound({ kind: "clip", src });
  }

  // Re-read the active member's per-member state after a member switch.
  private reloadForActiveMember(): void {
    this.ensureStarterMenu();
    this.menu = loadMenu(this.mem());
    this.characterState = loadCharacterState(this.mem());
  }

  private showVoice(): void {
    renderVoiceScreen(this.root, {
      store: this.deps.voiceStore,
      makeRecorder: () => this.deps.makeVoiceRecorder(),
      onBack: () => this.showSetup(),
      exportFile: this.deps.exportFile,
    });
  }

  private async beginTraining(): Promise<void> {
    // Past the limit the video gets too big to save and share (the setup
    // screen already disables 開始; this guards any other way in).
    if (totalSeconds(this.menu) > MAX_RECORD_SECONDS) {
      this.showSetup(`録画は${MAX_RECORD_SECONDS / 60}分までです。種目か秒数をへらしてね`);
      return;
    }

    // Show a loading screen while the camera warms up (can take a moment).
    renderLoadingScreen(this.root);

    const recorder = this.deps.makeVideoRecorder();
    // Saving needs room for the raw capture, the voice and the finished video
    // at once; running out mid-export would lose the practice.
    let free: number | null = null;
    try {
      free = (await recorder.freeDiskBytes?.()) ?? null;
    } catch {
      free = null;
    }
    const need = recordingBytesNeeded(totalSeconds(this.menu));
    if (free !== null && free < need) {
      this.showSetup(`iPhoneの空き容量が足りません。あと約${Math.max(0.1, (need - free) / 1e9).toFixed(1)}GB あけてね`);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await recorder.startCamera();
      await this.deps.wakeGuard.acquire();
    } catch {
      await recorder.cancel?.();
      await this.deps.wakeGuard.release();
      this.videoRecorder = null;
      this.showCameraError();
      return;
    }
    this.videoRecorder = recorder;

    const view = renderTrainingScreen(this.root, this.characterState.selectedId,
                                      effectiveDecor(loadPlan(this.base()), this.base()),
                                      !!this.deps.bgm);
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
    try {
      await recorder.startRecording();
    } catch {
      // Without this the loading screen stayed up forever with the camera
      // live and the screen kept awake.
      this.overlayLog = null;
      await recorder.cancel?.();
      await this.deps.wakeGuard.release();
      this.videoRecorder = null;
      this.showCameraError();
      return;
    }

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
    this.finishedDrills = [];
    this.finishedRows = new Set();
    this.currentRow = -1;
    this.paused = false;
    this.sessionEnding = false;
    view.setPaused(false);
    this.deps.bgm?.setMuted(getBgmMuted(this.base()));
    view.setBgmMuted(this.deps.bgm?.isMuted() ?? false);

    // Ready → 3 → 2 → 1 → Go!! intro. Ready is spoken; 3 / 2 / 1 go 「ぷっ」 and
    // Go!! a long 「ぷーん」, logged so the saved video has them too.
    // BGM and the drill timer both start on "Go!!".
    await playCountdownIntro(this.root, {
      stepMs: this.deps.introStepMs,
      onBeat: (cue) => {
        // Burned into the recording too, so the video opens with the same
        // Ready → 3 → 2 → 1 → Go!! the child saw on screen.
        this.overlayLog?.setState({ intro: cue });
        if (cue === "Ready") void this.deps.audioSink.speak("よーい");
        else this.playEffect(cue === "Go!!" ? COUNTDOWN_SOUNDS.go : COUNTDOWN_SOUNDS.tick);
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
      onDrillStart: (drill: Drill, index: number) => {
        this.currentRow = index;
        // 「2 / 5 種目」 counts real drills only — 休憩 is a break, not a 種目,
        // and counting it made a menu look twice as long as it practises.
        view.setDrill(drill, this.drillNumberAt(index), this.drillTotal());
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
        // A talking character cheers; its speech bubble carries the words.
        const clip = view.showCue("");
        if (clip) {
          this.deps.playCheerVoice?.(clip.audio);
          this.overlayLog?.logSound({ kind: "clip", src: clip.audio });
        }
        // The character's own voice is the encouragement now. Playing the
        // generic cue as well was the stray extra voice heard during cheers.
        if (!clip) void cuePlayer.encourage();
      },
      onCountdown: (n: number) => {
        this.cueCount++;
        void cuePlayer.countdown(n);
      },
      // A skipped drill just doesn't level up; 休憩 never does.
      onDrillEnd: (drill: Drill, finished: boolean) => {
        if (drill.kind === "rest" || !finished) return;
        this.finishedDrills.push(drill.name);
        this.finishedRows.add(this.currentRow);
      },
      onSessionEnd: () => { void this.finishSession(true); },
    };

    const scheduler = new SessionScheduler(this.menu, handlers);

    // ⏸ stops the drill timer and the music; the camera keeps recording.
    const setPaused = (paused: boolean) => {
      if (this.paused === paused || this.sessionEnding) return;
      this.paused = paused;
      if (paused) {
        scheduler.pause();
        this.stopRecTimer();
      } else {
        scheduler.resume();
        this.startRecTimer(view);
      }
      const musicOn = !paused && !getBgmMuted(this.base());
      this.deps.bgm?.setMuted(!musicOn);
      if (this.deps.bgm) this.overlayLog?.logSound({ kind: "bgm", playing: musicOn });
      view.setPaused(paused);
    };
    view.onPause(() => setPaused(!this.paused));
    // Leaving the app mid-practice pauses it, so the timer doesn't run on
    // without the child (native also reports the recording interruption).
    if (typeof document !== "undefined") {
      const onVisibility = () => { if (document.visibilityState === "hidden") setPaused(true); };
      document.addEventListener("visibilitychange", onVisibility);
      this.detachVisibility = () => document.removeEventListener("visibilitychange", onVisibility);
    }
    recorder.onInterrupted?.(() => { void this.finishSession(false, true); });
    view.onSkip(() => scheduler.skip());
    // 終了 partway: the video is still saved, but nothing counts toward progress.
    view.onStop(() => { void this.finishSession(false); });
    view.onToggleBgm(() => {
      const next = !getBgmMuted(this.base());
      setBgmMuted(next, this.base());
      view.setBgmMuted(next);
      if (this.paused) return;   // stays silent until ▶ 再開
      this.deps.bgm?.setMuted(next);
      this.overlayLog?.logSound({ kind: "bgm", playing: !next });
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

  private showCameraError(): void {
    this.showSetup(
      "カメラかマイクを開始できませんでした。設定でカメラとマイクを許可してください",
      this.deps.openSettings ? { label: "設定をひらく", run: () => this.deps.openSettings!() } : undefined,
    );
  }

  private leaveDoneScreen(): void {
    if (this.doneVideoUrl) URL.revokeObjectURL(this.doneVideoUrl);
    this.doneVideoUrl = null;
  }

  // 工夫 caption for a drill: the child's latest saved note for this 種目,
  // shown on-screen and burned into the recording.
  private captionFor(drill: Drill): string {
    return latestKufu(drill.name, this.mem(), this.kufuCaps());
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
  // interrupted: the phone stopped the recording (call, app switch).
  private async finishSession(completed: boolean, interrupted = false): Promise<void> {
    if (this.sessionEnding) return;
    this.sessionEnding = true;
    this.detachVisibility?.();
    this.detachVisibility = null;

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
      // Past the last drill: the video's 特訓一覧 marks every row done.
      if (completed) this.overlayLog?.setState({ drillIndex: this.menu.length });
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
      // Each drill's 強さ for the video's 特訓一覧: its level before this
      // practice, and whether this row earns one more (lit once it's done).
      const linked = this.linkedPreset();
      const before = linked ? loadMenuBelt(linked.id, this.mem()) : null;
      const menu: OverlayMenuItem[] = this.menu.map(({ name, seconds, kind }, i) => (
        before && kind !== "rest" && name.trim()
          ? { name, seconds, kind, level: levelOf(before, name), gained: completed && this.finishedRows.has(i) }
          : { name, seconds, kind }
      ));
      // 🔥 A practice that ran to the end with a finished drill counts for today.
      const streak = completed && this.finishedDrills.length > 0
        ? recordPracticeDay(this.mem())
        : currentStreak(this.mem());
      // Recorded BEFORE the video is saved: a long save can be cut short (the
      // app killed while 「動画を保存中…」), and the level must not be lost with it.
      // Only a practice run to the end counts (終了 partway adds nothing): each
      // drill that ran down to 0 gains a level in the picked saved menu, whose
      // belt bars are its lowest drill level. An unsaved menu has no belt.
      const missed: BeltMissReason | undefined = interrupted ? "interrupted"
        : !completed ? undefined
        : !linked ? "no-menu"
          : this.finishedDrills.length === 0 ? "no-drills"
            : undefined;
      let beltResult: DoneBeltResult = {
        completed,
        bars: before && linked ? beltStateFor(before, linked.menu).bars : 0,
        promotedTo: null,
        missed,
      };
      if (completed && linked && !missed) {
        const { state, promoted } = recordPractice(linked.id, linked.menu, this.finishedDrills, this.mem());
        beltResult = { completed, bars: state.bars, promotedTo: promoted ? BELTS[state.index].name : null };
      }

      const labels = {
        ...(streak > 0 ? { streakLabel: `🔥 ${streak}日間 毎日継続中` } : {}),
        ...(before ? { beltLabel: beltLabel(before.belt) } : {}),
        // The saved menu's name heads the video's 特訓一覧 panel.
        // Without a name the native side falls back to 特訓一覧, so the piano
        // app always sends its own heading.
        ...(linked?.name.trim() ? { menuName: linked.name.trim() } : IS_PIANO ? { menuName: COPY.listTitle } : {}),
        // Free always carries a decoration; 「なし」 needs a paid plan.
        decor: effectiveDecor(loadPlan(this.base()), this.base()),
      };
      const blob = recorder ? await recorder.stop(events, recordedDurationMs, menu, sounds, labels) : new Blob();
      await this.deps.wakeGuard.release();

      const ext = recorder ? recorder.fileExtension() : "webm";
      const nativeUrl = recorder?.playbackUrl?.() ?? null;
      const videoUrl = nativeUrl ?? URL.createObjectURL(blob);
      this.doneVideoUrl = nativeUrl ? null : videoUrl;
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
      // with where it first starts in the video (same clock as the burn-in).
      const startedAt = new Map<number, number>();
      for (const e of events) {
        const i = e.patch.drillIndex;
        if (i !== undefined && !startedAt.has(i)) startedAt.set(i, e.t / 1000);
      }
      const seen = new Set<string>();
      const kufuDrills = this.menu
        .filter((d) => d.kind !== "rest" && !seen.has(d.name) && seen.add(d.name))
        .map((d) => {
          const firstRun = this.menu.findIndex((m, j) => m.name === d.name && startedAt.has(j));
          return firstRun < 0 ? { name: d.name } : { name: d.name, at: startedAt.get(firstRun)! };
        });

      const blobForShare = blob;
      // Read when tapped: on native the file only exists once the save is done.
      const shareFileUri = () => recorder?.fileUri?.() ?? null;
      const shareExt = () => (recorder ? recorder.fileExtension() : ext);
      // Native: the practice plays at once (no text or sound yet) so the child
      // can watch themselves while writing a 工夫; the finished video replaces
      // it when the save is done.
      const progressFns: ((fraction: number) => void)[] = [];
      const finishing = recorder?.saved
        ? {
          done: recorder.saved((fraction) => { progressFns.forEach((fn) => fn(fraction)); }),
          onProgress: (fn: (fraction: number) => void) => { progressFns.push(fn); },
          onShown: () => recorder.markSeen?.(),
        }
        : undefined;
      renderDoneScreen(this.root, {
        videoUrl,
        ext,
        finishing,
        burnInPromise,
        burnInErrorPromise,
        diagnosticsText,
        stats: {
          time: formatMMSS(elapsedSeconds),
          drills: this.finishedDrills.length,
          cues: this.cueCount,
        },
        characterId: this.characterState.selectedId,
        beltResult,
        kufuDrills,
        kufuEnabled: this.kufuCaps().perDrill > 0,
        kufuPerDrill: this.kufuCaps().perDrill,
        kufuFor: (name) => kufuNotes(name, this.mem(), this.kufuCaps()),
        canAddKufuFor: (name) => canAddKufu(name, this.mem(), this.kufuCaps()),
        onAddKufu: (name, text) => { addKufu(name, text, this.mem(), this.kufuCaps()); },
        onRemoveKufu: (name, index) => removeKufuAt(name, index, this.mem()),
        // The share sheet can send the video (the child's face) anywhere, so a
        // parent has to pass the gate first.
        // A parent allowed this kid on the 家族 tab (itself gated), so sending
        // goes straight to the share sheet.
        shareAllowed: getShareAllowed(this.mem()),
        onSend: (burnedBlob) => {
          void Promise.resolve(this.deps.shareRecording(burnedBlob ?? blobForShare, shareExt(), shareFileUri()))
            .catch((e) => console.error("shareRecording failed", e));
        },
        onShare: (burnedBlob) => {
          const gate = this.deps.askParentalGate ?? askParentalGate;
          void gate(this.root).then((ok) => {
            if (!ok) return;
            return this.deps.shareRecording(burnedBlob ?? blobForShare, shareExt(), shareFileUri());
          }).catch((e) => {
            console.error("shareRecording failed", e);
          });
        },
        confirm: this.deps.confirm,
        onAgain: () => {
          this.leaveDoneScreen();
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
      // Make sure the camera, mic and keep-awake don't stay on.
      await this.videoRecorder?.cancel?.();
      await this.deps.wakeGuard.release().catch(() => { /* ignore */ });
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
