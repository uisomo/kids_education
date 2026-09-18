// Native (Capacitor/AVFoundation) video recorder — the iOS App Store build's
// replacement for getUserMedia + MediaRecorder + the ffmpeg.wasm burn-in pass.
//
// Why: on iOS the recorded image froze roughly 20-30s in while audio kept
// going, and the ffmpeg burn-in emitted one filter link per countdown second
// (~300 for a 5 minute session), which never completed inside WKWebView. The
// native plugin captures with AVCaptureMovieFileOutput and burns the overlay
// with AVFoundation's Core Animation compositor, so neither failure mode
// exists here. See ios/App/App/KarateRecorder/.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { OverlayEvent, OverlayMenuItem, SoundEvent } from "./overlay-event-log";

// stopRecording() answers as soon as the camera has stopped: the capture is
// already safe on disk and the overlay is burned in afterwards, in a save that
// survives the app being killed (it is finished on the next launch).
export interface NativeStopResult {
  // The queued save; its result arrives as an "exportFinished" event.
  jobId?: string;
  // The camera capture (no overlay, no sound) — playable right away.
  rawUri?: string;
  // Older native builds finished the save inside stopRecording().
  uri?: string;
  burnedIn?: boolean;
  burnError?: string;
  exportMode?: "burned" | "mixed" | "raw";
  soundMixed?: boolean;
  mixError?: string;
  // Set when the system cut the recording short (see onInterrupted()).
  interruption?: string;
}

// The finished video of one save ("exportFinished").
export interface NativeSaveResult {
  jobId: string;
  uri: string;
  burnedIn: boolean;
  burnError?: string;
  // "burned" (overlay + sound), "mixed" (sound, no overlay — burn-in failed),
  // or "raw" (the silent camera file — every export failed).
  exportMode?: "burned" | "mixed" | "raw";
  soundMixed?: boolean;
  mixError?: string;
  // Set when the system cut the recording short (see onInterrupted()).
  interruption?: string;
  // Finished on a later launch, after the app was killed mid-save.
  resumed?: boolean;
}

export interface SaveStatus {
  // A save still running (or queued), e.g. one resumed at launch.
  saving: { jobId: string; progress: number; resumed: boolean } | null;
  // Finished videos nobody has seen yet, oldest first.
  unseen: { jobId: string; uri: string; createdAt: number }[];
}

export interface KarateRecorderPluginLike {
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(opts: {
    events: OverlayEvent[];
    totalDurationMs: number;
    menu: OverlayMenuItem[];
    sounds: SoundEvent[];
    // 「🔥 N日間 毎日継続中」 (top-left) and 「🟢 緑帯」 (next to 特訓一覧).
    streakLabel?: string;
    beltLabel?: string;
    // The saved menu's name, heading the 特訓一覧 panel (wraps to two lines).
    menuName?: string;
    // "frame" | "icon" | "banner" | "none" — Alan's decoration on the video.
    decor?: string;
  }): Promise<NativeStopResult>;
  // Stops recording/preview/voice/music and deletes the session's temp files.
  // Optional so older native builds (and test fakes) without it still type.
  cancelRecording?(): Promise<void>;
  // Opens this app's page in the iOS Settings app (camera/mic permissions).
  openSettings?(): Promise<void>;
  // Free space on the phone ("important usage" capacity), in bytes.
  freeDiskSpace?(): Promise<{ bytes: number }>;
  // Capacitor's event subscription; "recordingInterrupted" carries { reason }.
  addListener?(
    eventName: "recordingInterrupted",
    listener: (data: { reason?: string }) => void,
  ): Promise<PluginListenerHandle>;
  // While a save writes the video: { jobId, progress } from 0 to 1.
  addListener?(
    eventName: "exportProgress",
    listener: (data: { jobId?: string; progress?: number }) => void,
  ): Promise<PluginListenerHandle>;
  // A save finished (fresh or resumed at launch).
  addListener?(
    eventName: "exportFinished",
    listener: (data: NativeSaveResult) => void,
  ): Promise<PluginListenerHandle>;
  getSaveStatus?(): Promise<SaveStatus>;
  markVideoSeen?(opts: { jobId: string }): Promise<void>;
  // Native playback (AudioController): one engine for music and character
  // voices, so neither interrupts the other and the volume really applies.
  playMusic(opts: { src: string; volume: number }): Promise<void>;
  setMusicPaused(opts: { paused: boolean }): Promise<void>;
  stopMusic(): Promise<void>;
  playClip(opts: { src: string; volume: number }): Promise<void>;
}

export interface NativeRecorderDeps {
  plugin?: KarateRecorderPluginLike;
  // Maps a file:// URI to something the web view can load. Capacitor's
  // convertFileSrc in production; injected in tests.
  toWebPath?: (uri: string) => string;
  // Toggles the transparency class on <html>. Injected in tests, which have no
  // real document to mutate.
  setPreviewClass?: (on: boolean) => void;
}

// Follows the native save queue: one subscription per plugin for the whole
// page, buffering results so a save that finishes before anyone asks (or
// while the done screen is gone) is not missed.
export class NativeSaveTracker {
  private listening: Promise<void> | null = null;
  private finished = new Map<string, NativeSaveResult>();
  private waiters = new Map<string, ((r: NativeSaveResult) => void)[]>();
  private progressFns = new Map<string, Set<(fraction: number) => void>>();
  private anyFinished = new Set<(r: NativeSaveResult) => void>();

  constructor(private plugin: KarateRecorderPluginLike) {}

  // Subscribes once. Awaited before stopRecording() so no event can slip by.
  listen(): Promise<void> {
    const plugin = this.plugin;
    return (this.listening ??= (async () => {
      if (typeof plugin.addListener !== "function") return;
      try {
        await plugin.addListener("exportProgress", (data) => {
          if (!data?.jobId || typeof data.progress !== "number") return;
          const fraction = Math.min(1, Math.max(0, data.progress));
          this.progressFns.get(data.jobId)?.forEach((fn) => fn(fraction));
        });
        await plugin.addListener("exportFinished", (data) => {
          if (!data?.jobId) return;
          this.finished.set(data.jobId, data);
          this.progressFns.delete(data.jobId);
          const list = this.waiters.get(data.jobId) ?? [];
          this.waiters.delete(data.jobId);
          list.forEach((fn) => fn(data));
          this.anyFinished.forEach((fn) => fn(data));
        });
      } catch (e) {
        console.warn("native save listener failed", e);
      }
    })());
  }

  // Resolves when that save has finished; onProgress gets 0…1 until then.
  watch(jobId: string, onProgress?: (fraction: number) => void): Promise<NativeSaveResult> {
    const done = this.finished.get(jobId);
    if (done) return Promise.resolve(done);
    if (onProgress) {
      const set = this.progressFns.get(jobId) ?? new Set();
      set.add(onProgress);
      this.progressFns.set(jobId, set);
    }
    return new Promise((resolve) => {
      this.waiters.set(jobId, [...(this.waiters.get(jobId) ?? []), resolve]);
    });
  }

  // Every finished save from now on; returns an unsubscribe function.
  onFinished(fn: (r: NativeSaveResult) => void): () => void {
    void this.listen();
    this.anyFinished.add(fn);
    return () => { this.anyFinished.delete(fn); };
  }

  async status(): Promise<SaveStatus | null> {
    await this.listen();
    try {
      if (typeof this.plugin.getSaveStatus !== "function") return null;
      return await this.plugin.getSaveStatus();
    } catch {
      return null;
    }
  }

  // A URL the web view can play a finished file from.
  playbackUrl(uri: string): string {
    return defaultToWebPath(uri);
  }

  async markSeen(jobId: string): Promise<void> {
    try {
      await this.plugin.markVideoSeen?.({ jobId });
    } catch {
      /* best-effort: worst case the video is offered once more */
    }
  }
}

const trackers = new WeakMap<object, NativeSaveTracker>();

export function nativeSaveTracker(plugin: KarateRecorderPluginLike = karateRecorderPlugin()): NativeSaveTracker {
  let tracker = trackers.get(plugin);
  if (!tracker) {
    tracker = new NativeSaveTracker(plugin);
    trackers.set(plugin, tracker);
  }
  return tracker;
}

function defaultToWebPath(uri: string): string {
  return Capacitor.convertFileSrc(uri);
}

// app.ts assigns the returned stream to the preview <video> and asks it for
// video tracks; nothing else is read. WKWebView has a real MediaStream, jsdom
// does not, so fall back to the shape those two call sites need.
function emptyStream(): MediaStream {
  if (typeof MediaStream !== "undefined") return new MediaStream();
  return {
    getTracks: () => [],
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

// One proxy for the whole page. registerPlugin() warns ("Cannot register
// plugins twice") every time it's called again for the same name, and a new
// NativeVideoRecorder is created for every training session.
let sharedPlugin: KarateRecorderPluginLike | null = null;

export function karateRecorderPlugin(): KarateRecorderPluginLike {
  return (sharedPlugin ??= registerPlugin<KarateRecorderPluginLike>("KarateRecorder"));
}

// Opens the app's page in iOS Settings, e.g. after camera permission was
// denied. A no-op off native; never rejects.
export async function openAppSettings(
  deps: { plugin?: KarateRecorderPluginLike; isNative?: boolean } = {},
): Promise<void> {
  const isNative = deps.isNative ?? Capacitor.isNativePlatform();
  if (!isNative) return;
  try {
    const plugin = deps.plugin ?? karateRecorderPlugin();
    await plugin.openSettings?.();
  } catch (e) {
    console.warn("openAppSettings failed", e);
  }
}

export class NativeVideoRecorder {
  private plugin: KarateRecorderPluginLike | null = null;
  private deps: NativeRecorderDeps;
  private lastUri: string | null = null;
  private lastPlaybackUrl: string | null = null;
  private lastBurnError: string | null = null;
  private burnedIn = false;
  private interruptCallback: ((reason: string) => void) | null = null;
  private listener: Promise<PluginListenerHandle | undefined> | null = null;
  private jobId: string | null = null;
  private saving: Promise<NativeSaveResult | null> | null = null;

  constructor(deps: NativeRecorderDeps = {}) {
    this.deps = deps;
  }

  // Deliberately synchronous. registerPlugin() returns a Proxy that turns every
  // property — including `then` — into a native call, so the proxy must never
  // be returned from an async function or awaited: JS would treat it as a
  // promise, call proxy.then(), and wait forever for a native method that
  // doesn't exist. That is what left the app stuck on 準備中.
  private getPlugin(): KarateRecorderPluginLike {
    if (!this.plugin) {
      this.plugin = this.deps.plugin ?? karateRecorderPlugin();
    }
    return this.plugin;
  }

  private setPreviewClass(on: boolean): void {
    if (this.deps.setPreviewClass) {
      this.deps.setPreviewClass(on);
      return;
    }
    const list = document.documentElement.classList;
    if (on) list.add("native-camera");
    else list.remove("native-camera");
  }

  fileExtension(): string {
    // The export writes .mp4; when every export failed the raw capture (.mov)
    // comes back instead.
    return this.lastUri && /\.mov$/i.test(this.lastUri) ? "mov" : "mp4";
  }

  // The native preview layer renders behind the (transparent) web view, so
  // there is no MediaStream to hand back. An empty stream keeps the caller's
  // `videoEl.srcObject = stream` harmless — the <video> stays transparent and
  // the camera shows through from the native layer underneath.
  async startCamera(): Promise<MediaStream> {
    const plugin = this.getPlugin();
    await plugin.startPreview();
    // Makes the web layer transparent so the native preview behind it shows
    // through — see the html.native-camera rules in style.css.
    this.setPreviewClass(true);
    return emptyStream();
  }

  // Bytes free for a recording, or null when unknown (older native build,
  // or iOS didn't say). Never rejects.
  async freeDiskBytes(): Promise<number | null> {
    try {
      const plugin = this.getPlugin();
      if (typeof plugin.freeDiskSpace !== "function") return null;
      const result = await plugin.freeDiskSpace();
      return typeof result?.bytes === "number" && Number.isFinite(result.bytes) ? result.bytes : null;
    } catch {
      return null;
    }
  }

  async startRecording(): Promise<void> {
    const plugin = this.getPlugin();
    await plugin.startRecording();
  }

  // Called when the system cuts the recording short (camera interrupted, app
  // sent to the background, a phone call). The caller should wind the session
  // down and still call stop(), which returns what was captured.
  onInterrupted(cb: (reason: string) => void): void {
    this.interruptCallback = cb;
    if (this.listener) return;
    const plugin = this.getPlugin();
    if (typeof plugin.addListener !== "function") return;
    this.listener = Promise.resolve()
      .then(() => plugin.addListener?.("recordingInterrupted", (data) => {
        this.interruptCallback?.(data?.reason ?? "unknown");
      }))
      .catch((e: unknown) => {
        console.warn("native interruption listener failed", e);
        return undefined;
      });
  }

  private removeInterruptListener(): void {
    this.interruptCallback = null;
    const pending = this.listener;
    this.listener = null;
    void pending?.then((handle) => handle?.remove()).catch(() => { /* best-effort */ });
  }

  // Stops the camera and resolves as soon as the capture is safe on disk; the
  // overlay burn-in and sound mix then run natively (see saved()). Until they
  // finish, playbackUrl() is the capture itself — no text, no sound — so the
  // done screen can show the child their practice straight away.
  //
  // Resolves an EMPTY Blob: the finished video can be hundreds of MB, and
  // reading it into the web view is what risked the app being killed. Use
  // playbackUrl() for the <video> and fileUri() for sharing.
  async stop(
    events: OverlayEvent[] = [],
    totalDurationMs = 0,
    menu: OverlayMenuItem[] = [],
    sounds: SoundEvent[] = [],
    labels: { streakLabel?: string; beltLabel?: string; menuName?: string; decor?: string } = {},
  ): Promise<Blob> {
    const plugin = this.getPlugin();
    this.removeInterruptListener();
    const tracker = nativeSaveTracker(plugin);
    // Before stopRecording(), so the save's events can't arrive unheard.
    await tracker.listen();
    try {
      // Paired with the native "sounds: N received" line: together they show
      // whether the countdown clips were logged at all and whether they survived
      // the bridge.
      const clipCount = sounds.filter((s) => s.kind === "clip").length;
      console.warn(`[KarateRecorder] sending ${sounds.length} sounds (${clipCount} clips) to stopRecording`);
      const result = await plugin.stopRecording({ events, totalDurationMs, menu, sounds, ...labels });
      if (result.interruption) {
        console.warn(`[KarateRecorder] recording was interrupted: ${result.interruption}`);
      }
      const toWebPath = this.deps.toWebPath ?? defaultToWebPath;
      if (result.jobId && result.rawUri) {
        this.jobId = result.jobId;
        this.lastUri = null;
        this.lastPlaybackUrl = toWebPath(result.rawUri);
        this.saving = tracker.watch(result.jobId).then((r) => this.adopt(r, sounds.length));
      } else if (result.uri) {
        // An older native build: already finished.
        const done: NativeSaveResult = { ...result, jobId: "", uri: result.uri, burnedIn: !!result.burnedIn };
        this.saving = Promise.resolve(this.adopt(done, sounds.length));
      }
      return new Blob([], { type: this.fileExtension() === "mov" ? "video/quicktime" : "video/mp4" });
    } finally {
      // Even when stopping failed: otherwise the camera and mic stay on.
      await plugin.stopPreview().catch(() => { /* teardown is best-effort */ });
      this.setPreviewClass(false);
    }
  }

  private adopt(result: NativeSaveResult, soundCount: number): NativeSaveResult {
    this.lastUri = result.uri;
    this.burnedIn = result.burnedIn;
    this.lastBurnError = result.burnError ?? null;
    // The native side reports a failed sound mix, but nothing used to read it:
    // when the full mix throws it silently falls back to voice-only, so the
    // countdown 「ぷっ」, the cheers and the BGM all vanish from the saved video
    // while the overlay still burns in perfectly. Surface it — the message
    // names the exact step that failed (see SoundMixer.StepError).
    if (result.mixError) {
      console.warn(`[KarateRecorder] sound mix fell back: ${result.mixError}`);
    } else if (soundCount > 0 && result.soundMixed === false) {
      console.warn(`[KarateRecorder] ${soundCount} sounds logged but none were mixed in`);
    }
    const toWebPath = this.deps.toWebPath ?? defaultToWebPath;
    this.lastPlaybackUrl = toWebPath(result.uri);
    return result;
  }

  // The finished video (overlay + sound): its playback URL, once the save is
  // done. null when there is no save to wait for. onProgress gets 0…1.
  async saved(onProgress?: (fraction: number) => void): Promise<{ playbackUrl: string; fileUri: string } | null> {
    if (!this.saving) return null;
    if (this.jobId && onProgress) void nativeSaveTracker(this.getPlugin()).watch(this.jobId, onProgress);
    const result = await this.saving;
    if (!result || !this.lastPlaybackUrl || !this.lastUri) return null;
    return { playbackUrl: this.lastPlaybackUrl, fileUri: this.lastUri };
  }

  // The finished video was shown to the child: don't offer it again later.
  markSeen(): void {
    if (this.jobId) void nativeSaveTracker(this.getPlugin()).markSeen(this.jobId);
  }

  // Abandons the session — e.g. startRecording() failed — stopping camera, mic
  // and music and deleting its temp files. Safe in any state; never rejects.
  async cancel(): Promise<void> {
    this.removeInterruptListener();
    try {
      const plugin = this.getPlugin();
      try {
        if (typeof plugin.cancelRecording !== "function") throw new Error("cancelRecording unavailable");
        await plugin.cancelRecording();
      } catch {
        await plugin.stopPreview().catch(() => { /* best-effort */ });
      }
    } catch {
      /* no plugin at all: nothing to tear down */
    }
    try {
      this.setPreviewClass(false);
    } catch {
      /* no document */
    }
  }

  // The on-disk file, for handing straight to the OS share sheet instead of
  // round-tripping the whole video through base64. null until saved() is done.
  fileUri(): string | null {
    return this.lastUri;
  }

  // A URL the web view can load the finished video from (for <video src>).
  playbackUrl(): string | null {
    return this.lastPlaybackUrl;
  }

  didBurnIn(): boolean {
    return this.burnedIn;
  }

  burnError(): string | null {
    return this.lastBurnError;
  }
}
