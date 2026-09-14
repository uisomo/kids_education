// Native (Capacitor/AVFoundation) video recorder — the iOS App Store build's
// replacement for getUserMedia + MediaRecorder + the ffmpeg.wasm burn-in pass.
//
// Why: on iOS the recorded image froze roughly 20-30s in while audio kept
// going, and the ffmpeg burn-in emitted one filter link per countdown second
// (~300 for a 5 minute session), which never completed inside WKWebView. The
// native plugin captures with AVCaptureMovieFileOutput and burns the overlay
// with AVFoundation's Core Animation compositor, so neither failure mode
// exists here. See ios/App/App/KarateRecorder/.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { OverlayEvent, OverlayMenuItem, SoundEvent } from "./overlay-event-log";

export interface KarateRecorderPluginLike {
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(opts: {
    events: OverlayEvent[];
    totalDurationMs: number;
    menu: OverlayMenuItem[];
    sounds: SoundEvent[];
  }): Promise<{ uri: string; burnedIn: boolean; burnError?: string }>;
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
  toWebPath?: (uri: string) => string | Promise<string>;
  fetchBlob?: (url: string) => Promise<Blob>;
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

export class NativeVideoRecorder {
  private plugin: KarateRecorderPluginLike | null = null;
  private deps: NativeRecorderDeps;
  private lastUri: string | null = null;
  private lastBurnError: string | null = null;
  private burnedIn = false;

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
    // AVAssetExportSession writes .mp4; the raw-capture fallback is .mov, but
    // both play and share as MP4-family video, and the share sheet keys off
    // the file's own extension rather than this.
    return "mp4";
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

  async startRecording(): Promise<void> {
    const plugin = this.getPlugin();
    await plugin.startRecording();
  }

  // Overlay burn-in happens natively inside this call, so unlike the web path
  // there is no separate burnOverlay() step afterwards.
  async stop(
    events: OverlayEvent[] = [],
    totalDurationMs = 0,
    menu: OverlayMenuItem[] = [],
    sounds: SoundEvent[] = [],
  ): Promise<Blob> {
    const plugin = this.getPlugin();
    const result = await plugin.stopRecording({ events, totalDurationMs, menu, sounds });
    this.lastUri = result.uri;
    this.burnedIn = result.burnedIn;
    this.lastBurnError = result.burnError ?? null;

    await plugin.stopPreview().catch(() => { /* teardown is best-effort */ });
    this.setPreviewClass(false);

    const toWebPath = this.deps.toWebPath ?? defaultToWebPath;
    const webPath = await toWebPath(result.uri);
    const fetchBlob = this.deps.fetchBlob ?? ((u: string) => fetch(u).then((r) => r.blob()));
    return fetchBlob(webPath);
  }

  // The on-disk file, for handing straight to the OS share sheet instead of
  // round-tripping the whole video through base64.
  fileUri(): string | null {
    return this.lastUri;
  }

  didBurnIn(): boolean {
    return this.burnedIn;
  }

  burnError(): string | null {
    return this.lastBurnError;
  }
}
