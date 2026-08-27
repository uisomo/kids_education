import { KarateApp } from "./app";
import { VideoRecorder } from "./recorder";
import { VoiceRecorder } from "./voice-recorder";
import { BrowserAudioSink } from "./audio-sink";
import { VoiceStore, idbKv } from "./voice-store";
import { WakeGuard } from "./wake-lock";

const root = document.querySelector<HTMLElement>("#app")!;
const store = new VoiceStore(idbKv());

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
  wakeGuard: new WakeGuard(),
  rafLoop,
});
await app.start();
