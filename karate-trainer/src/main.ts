import { KarateApp, type BgmPlayer } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { makeWakeGuard, shareRecording } from "./platform";
import { CanvasCompositor } from "./canvas-compositor";
import { mountInstallBanner, detectEnv } from "./ui/install-banner";

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

mountInstallBanner(document.body, detectEnv());

// Background music played during a session (loops from Go!! to session end).
// The filename is Japanese, so encode it for the URL.
function makeBgm(): BgmPlayer {
  const audio = new Audio(`/characters/${encodeURIComponent("君ならできる")}.mp3`);
  audio.loop = true;
  audio.preload = "auto";
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
  };
}

const rafLoop = (() => {
  let raf = 0, last = 0;
  return {
    start(cb: (d: number) => void) {
      last = performance.now();
      const step = (t: number) => { cb(t - last); last = t; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(raf); },
  };
})();

await store.init();
const app = new KarateApp(root, {
  voiceStore: store,
  audioSink: new BrowserAudioSink(),
  makeVideoRecorder: () => new VideoRecorder(),
  makeVoiceRecorder: () => new VoiceRecorder(),
  wakeGuard: makeWakeGuard(),
  rafLoop,
  shareRecording,
  bgm: makeBgm(),
  // Burn overlays into the recording when the browser supports canvas capture;
  // otherwise omit so recording falls back to the raw camera feed.
  makeCompositor: CanvasCompositor.isSupported()
    ? (video) => new CanvasCompositor(video)
    : undefined,
});
await app.start();
