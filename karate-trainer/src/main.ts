import { KarateApp, type BgmPlayer } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { makeWakeGuard, shareRecording } from "./platform";
import { mountInstallBanner, detectEnv } from "./ui/install-banner";
import { burnOverlay } from "./overlay-burner";
import { NativeVideoRecorder, openAppSettings } from "./native-recorder";
import { makeBackupScheduler, mirroredStorage, nativeBackupFile, restoreIfEmpty } from "./storage-backup";
import { makeNativeBgm, playNativeClip } from "./native-audio";
import { Capacitor } from "@capacitor/core";
import { makeRevenueCatBilling } from "./revenuecat-billing";

// iOS App Store build. The native recorder captures with AVFoundation and
// burns the overlay itself, so neither MediaRecorder nor the ffmpeg.wasm pass
// is used there — see native-recorder.ts for why both had to go.
const isNative = Capacitor.isNativePlatform();

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

// The install banner only makes sense in a browser; inside the app the user
// has already installed it.
if (!isNative) mountInstallBanner(document.body, detectEnv());

// Background music played during a session (loops from Go!! to session end).
// The filename is Japanese, so encode it for the URL.
// The microphone records whatever the speaker plays, so the music has to stay
// well under the child's own voice in the saved video.
const BGM_GAIN = 0.2;
const CHEER_VOICE_VOLUME = 0.9;
const EFFECT_VOLUME = 0.8;
const BGM_SRC = `/characters/${encodeURIComponent("君ならできる")}.mp3`;

function makeBgm(): BgmPlayer {
  const src = BGM_SRC;
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  // iOS treats HTMLMediaElement.volume as read-only — assignments are ignored —
  // so quieting the music means routing it through Web Audio and scaling it
  // with a GainNode. Built inside unlock() (a user gesture), because an
  // AudioContext created outside one starts suspended and would silence the
  // element entirely once it's attached.
  let ctx: AudioContext | null = null;
  const attachGain = () => {
    if (ctx) return;
    try {
      const Ctx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = BGM_GAIN;
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
    } catch {
      ctx = null; // Web Audio unavailable: plays at full volume rather than not at all
    }
  };
  const resumeGain = () => { void ctx?.resume().catch(() => { /* ignore */ }); };
  let unlocked = false;
  let muted = false;
  // Tracks whether a session wants BGM playing right now, independent of
  // whether it's actually audible (muted pauses playback but keeps this true
  // so unmuting mid-session resumes it).
  let sessionActive = false;
  return {
    unlock() {
      if (unlocked) return;
      unlocked = true;
      attachGain();
      resumeGain();
      // Play muted for a tick inside the user gesture, then reset. This marks
      // the element as user-activated so the real play() at Go!! is allowed.
      const wasMuted = audio.muted;
      audio.muted = true;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = wasMuted;
        })
        .catch(() => { audio.muted = wasMuted; });
    },
    play() {
      sessionActive = true;
      audio.currentTime = 0;
      if (muted) return;
      resumeGain();
      void audio.play().catch(() => { /* autoplay blocked — ignore */ });
    },
    stop() {
      sessionActive = false;
      audio.pause();
      audio.currentTime = 0;
    },
    setMuted(next: boolean) {
      muted = next;
      if (muted) {
        audio.pause();
      } else if (sessionActive) {
        void audio.play().catch(() => { /* autoplay blocked — ignore */ });
      }
    },
    isMuted() {
      return muted;
    },
    src,
  };
}

const rafLoop = (() => {
  let raf = 0, last = 0;
  return {
    start(cb: (d: number) => void) {
      last = performance.now();
      // Capped: after the app was in the background rAF resumes with a delta of
      // seconds or minutes, which would jump the drill timer. The session
      // pauses itself when hidden, so dropping that time is correct.
      const step = (t: number) => { cb(Math.min(250, Math.max(0, t - last))); last = t; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(raf); },
  };
})();

await store.init();

// Native: localStorage is mirrored into a file so iOS clearing web storage
// can't wipe the kids' progress (see storage-backup.ts).
let storage: Storage | undefined;
if (isNative) {
  const file = nativeBackupFile();
  const saved = await file.read();
  if (saved) restoreIfEmpty(localStorage, saved);
  const backup = makeBackupScheduler(localStorage, file);
  storage = mirroredStorage(localStorage, () => backup.schedule());
  void backup.flush();   // existing installs get a backup right away
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void backup.flush();
  });
}
void navigator.storage?.persist?.().catch(() => { /* not supported */ });

async function exportFile(filename: string, blob: Blob): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const written = await Filesystem.writeFile({ path: filename, data: btoa(bin), directory: Directory.Cache });
  try {
    await Share.share({ title: "アランの空手", url: written.uri });
  } catch (e) {
    // Closing the share sheet rejects with "Share canceled" — not an error.
    if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
  }
}

const app = new KarateApp(root, {
  storage,
  // App Store subscriptions. The RevenueCat public SDK key comes from
  // karate-trainer/.env.local (VITE_REVENUECAT_API_KEY): test_… for the Test
  // Store while developing, appl_… for release.
  billing: isNative ? makeRevenueCatBilling(import.meta.env.VITE_REVENUECAT_API_KEY ?? "") : undefined,
  openSettings: isNative ? () => { void openAppSettings(); } : undefined,
  exportFile: isNative ? exportFile : undefined,
  voiceStore: store,
  audioSink: new BrowserAudioSink(),
  makeVideoRecorder: () => (isNative ? new NativeVideoRecorder() : new VideoRecorder()),
  makeVoiceRecorder: () => new VoiceRecorder(),
  // Passing the flag matters: without it makeWakeGuard always took the web
  // branch, so the keep-awake plugin never ran on device and the screen could
  // still sleep mid-practice.
  wakeGuard: makeWakeGuard({ isNative: () => isNative }),
  rafLoop,
  shareRecording,
  bgm: isNative ? makeNativeBgm(BGM_SRC, BGM_GAIN) : makeBgm(),
  playEffect: isNative
    ? (src) => playNativeClip(src, EFFECT_VOLUME)
    : (src) => { void new Audio(src).play().catch(() => { /* autoplay blocked */ }); },
  playCheerVoice: isNative
    ? (src) => playNativeClip(src, CHEER_VOICE_VOLUME)
    : (src) => { void new Audio(src).play().catch(() => { /* autoplay blocked */ }); },
  // Web only. Burns overlay text into the saved recording as an offline
  // post-process via ffmpeg.wasm, falling back to the raw video on failure.
  // The native recorder does its own burn-in during stop(), so leaving this
  // undefined there avoids a second, redundant pass over the same video.
  burnOverlay: isNative
    ? undefined
    : (rawVideoBlob, events, totalDurationMs, ext, onError) =>
        burnOverlay(rawVideoBlob, events, totalDurationMs, ext, {}, onError),
});
await app.start();
