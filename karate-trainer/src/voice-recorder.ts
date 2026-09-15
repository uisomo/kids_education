const AUDIO_MIMES = ["audio/mp4", "audio/webm", "audio/ogg"];

export interface VoiceRecorderDeps {
  getMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  makeRecorder?: (s: MediaStream, mime: string) => MediaRecorder;
}

export class VoiceRecorder {
  private getMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  private makeRecorder: (s: MediaStream, mime: string) => MediaRecorder;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private mime = "";

  constructor(deps: VoiceRecorderDeps = {}) {
    this.getMedia = deps.getMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    this.makeRecorder = deps.makeRecorder ?? ((s, mime) => new MediaRecorder(s, mime ? { mimeType: mime } : undefined));
  }

  private pickMime(): string {
    const ok = (t: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t);
    return AUDIO_MIMES.find(ok) ?? "";
  }

  async start(): Promise<void> {
    this.stream = await this.getMedia({ audio: true });
    this.mime = this.pickMime();
    this.chunks = [];
    this.recorder = this.makeRecorder(this.stream, this.mime);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }

  // Resolves with the recorded audio. Never hangs: if the recorder isn't
  // recording (never started, already stopped, or stop() throws) it settles
  // immediately; a recorder error rejects.
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      this.recorder = undefined;   // a second stop() settles immediately
      let settled = false;
      const release = () => this.stream?.getTracks().forEach((t) => t.stop());
      const finish = () => {
        if (settled) return;
        settled = true;
        release();
        resolve(new Blob(this.chunks, { type: this.mime || "audio/mp4" }));
      };
      if (!rec || rec.state === "inactive") return finish();
      rec.onstop = finish;
      rec.onerror = (ev: Event) => {
        if (settled) return;
        settled = true;
        release();
        reject((ev as Event & { error?: unknown }).error ?? new Error("recorder error"));
      };
      try {
        rec.stop();
      } catch {
        finish();
      }
    });
  }
}
