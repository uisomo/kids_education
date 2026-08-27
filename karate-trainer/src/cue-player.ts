export type CueRole = "announce" | "countdown" | "encouragement";

export interface ClipSource {
  list(role: CueRole): { id: string; url: string }[];
}
export interface CueSink {
  playUrl(url: string): Promise<void>;
  beep(): Promise<void>;
  speak(text: string): Promise<void>;
}

export const DEFAULT_ENCOURAGE = ["もっと早く", "一生懸命", "いいぞ"];

export class CuePlayer {
  constructor(
    private source: ClipSource,
    private sink: CueSink,
    private rng: () => number = Math.random,
  ) {}

  private pick<T>(arr: T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.rng() * arr.length))];
  }

  async announce(): Promise<void> {
    const clips = this.source.list("announce");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.speak("始め");
  }

  async encourage(): Promise<void> {
    const clips = this.source.list("encouragement");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.speak(this.pick(DEFAULT_ENCOURAGE));
  }

  async countdown(_n: number): Promise<void> {
    const clips = this.source.list("countdown");
    if (clips.length) return this.sink.playUrl(this.pick(clips).url);
    return this.sink.beep();
  }
}
