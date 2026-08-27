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

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.mime || "audio/mp4" }));
      };
      if (!this.recorder) return finish();
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }
}
