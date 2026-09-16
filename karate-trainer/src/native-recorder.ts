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

export interface NativeStopResult {
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

  // Overlay burn-in happens natively inside this call, so unlike the web path
  // there is no separate burnOverlay() step afterwards.
  //
  // Resolves an EMPTY Blob: the finished video can be hundreds of MB, and
  // reading it into the web view is what risked the app being killed. Use
  // playbackUrl() for the <video> and fileUri() for sharing.
  async stop(
    events: OverlayEvent[] = [],
    totalDurationMs = 0,
    menu: OverlayMenuItem[] = [],
    sounds: SoundEvent[] = [],
    labels: { streakLabel?: string; beltLabel?: string; decor?: string } = {},
  ): Promise<Blob> {
    const plugin = this.getPlugin();
    this.removeInterruptListener();
    try {
      // Paired with the native "sounds: N received" line: together they show
      // whether the countdown clips were logged at all and whether they survived
      // the bridge.
      const clipCount = sounds.filter((s) => s.kind === "clip").length;
      console.warn(`[KarateRecorder] sending ${sounds.length} sounds (${clipCount} clips) to stopRecording`);
      const result = await plugin.stopRecording({ events, totalDurationMs, menu, sounds, ...labels });
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
      } else if (sounds.length > 0 && result.soundMixed === false) {
        console.warn(`[KarateRecorder] ${sounds.length} sounds logged but none were mixed in`);
      }
      if (result.interruption) {
        console.warn(`[KarateRecorder] recording was interrupted: ${result.interruption}`);
      }
      const toWebPath = this.deps.toWebPath ?? defaultToWebPath;
      this.lastPlaybackUrl = toWebPath(result.uri);
      return new Blob([], { type: this.fileExtension() === "mov" ? "video/quicktime" : "video/mp4" });
    } finally {
      // Even when stopping failed: otherwise the camera and mic stay on.
      await plugin.stopPreview().catch(() => { /* teardown is best-effort */ });
      this.setPreviewClass(false);
    }
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
  // round-tripping the whole video through base64.
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
