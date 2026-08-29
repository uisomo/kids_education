import { KarateApp, type BgmPlayer } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { makeWakeGuard, shareRecording } from "./platform";
import { CanvasCompositor } from "./canvas-compositor";

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

// Background music played during a session (loops from Go!! to session end).
// The filename is Japanese, so encode it for the URL.
function makeBgm(): BgmPlayer {
  const audio = new Audio(`/characters/${encodeURIComponent("君ならできる")}.mp3`);
  audio.loop = true;
  audio.preload = "auto";
  let unlocked = false;
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
      audio.currentTime = 0;
      void audio.play().catch(() => { /* autoplay blocked — ignore */ });
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
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
