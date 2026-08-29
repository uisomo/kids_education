import { KarateApp, type BgmPlayer } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { makeWakeGuard, shareRecording } from "./platform";

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

// Background music played during a session (loops from Go!! to session end).
// The filename is Japanese, so encode it for the URL.
function makeBgm(): BgmPlayer {
  const audio = new Audio(`/characters/${encodeURIComponent("君ならできる")}.wav`);
  audio.loop = true;
  audio.preload = "auto";
  return {
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
});
await app.start();
