import type { CueSink } from "./cue-player";

export interface AudioSinkDeps {
  makeAudio?: (url: string) => HTMLAudioElement;
  synth?: SpeechSynthesis;
  audioCtx?: AudioContext;
}

export class BrowserAudioSink implements CueSink {
  private makeAudio: (url: string) => HTMLAudioElement;
  private synth?: SpeechSynthesis;
  private ctx?: AudioContext;

  constructor(deps: AudioSinkDeps = {}) {
    this.makeAudio = deps.makeAudio ?? ((url) => new Audio(url));
    this.synth = deps.synth ?? (typeof speechSynthesis !== "undefined" ? speechSynthesis : undefined);
    this.ctx = deps.audioCtx;
  }

  playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = this.makeAudio(url);
      el.addEventListener("ended", () => resolve(), { once: true });
      el.addEventListener("error", () => resolve(), { once: true });
      void el.play().catch(() => resolve());
    });
  }

  speak(text: string): Promise<void> {
    if (!this.synth) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.synth!.speak(u);
    });
  }

  beep(): Promise<void> {
    try {
      this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch { /* audio unavailable — silent */ }
    return Promise.resolve();
  }
}
