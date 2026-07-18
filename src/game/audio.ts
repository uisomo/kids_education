import { ttsUrl } from "./api";

type Sfx = "hit" | "miss" | "fanfare" | "unlock" | "click" | "ding";
type BgmPhase = "teach" | "battle" | "victory";

export class AudioMan {
  private bgm: HTMLAudioElement | null = null;
  private current: HTMLAudioElement | null = null;
  private ducked = false;
  private gen = 0;

  constructor(private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  playBgm(phase: BgmPhase): void {
    this.stopBgm();
    const a = new Audio(`/audio/bgm/${phase}.mp3`);
    a.loop = true;
    a.volume = this.ducked ? 0.12 : 0.6;
    a.play().catch(() => { /* asset missing or autoplay blocked → silent slot */ });
    this.bgm = a;
  }

  stopBgm(): void { this.bgm?.pause(); this.bgm = null; }

  sfx(name: Sfx): void {
    const a = new Audio(`/audio/sfx/${name}.mp3`);
    a.play().catch(() => { /* silent slot until asset box arrives */ });
  }

  private duck(on: boolean): void {
    this.ducked = on;
    if (this.bgm) this.bgm.volume = on ? 0.12 : 0.6;
  }

  async speak(text: string, speaker: number): Promise<void> {
    this.interrupt();
    const myGen = ++this.gen;
    this.duck(true);
    try {
      const r = await this.fetchFn(ttsUrl(text, speaker));
      if (myGen !== this.gen) return;
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      if (myGen !== this.gen) return;
      await new Promise<void>((resolve) => {
        const a = new Audio(URL.createObjectURL(blob));
        this.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      });
    } catch {
      if (myGen !== this.gen) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.onend = () => resolve();
        window.speechSynthesis.speak(u);
      });
    } finally {
      if (myGen === this.gen) {
        this.duck(false);
        this.current = null;
      }
    }
  }

  interrupt(): void {
    this.current?.pause();
    this.current = null;
    window.speechSynthesis?.cancel?.();
    this.gen++;
    this.duck(false);
  }
}
