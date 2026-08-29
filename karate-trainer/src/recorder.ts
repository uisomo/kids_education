const MIME_CANDIDATES = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];

export interface RecorderDeps {
  getMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  makeRecorder?: (s: MediaStream, mime: string) => MediaRecorder;
}

export class VideoRecorder {
  private getMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  private makeRecorder: (s: MediaStream, mime: string) => MediaRecorder;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private mime = "";

  constructor(deps: RecorderDeps = {}) {
    this.getMedia = deps.getMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    this.makeRecorder = deps.makeRecorder ?? ((s, mime) => new MediaRecorder(s, { mimeType: mime }));
  }

  pickMime(): string {
    const supported = (t: string) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t);
    return MIME_CANDIDATES.find(supported) ?? "video/mp4";
  }

  fileExtension(): string {
    return this.pickMime().startsWith("video/mp4") ? "mp4" : "webm";
  }

  async startCamera(): Promise<MediaStream> {
    this.stream = await this.getMedia({ video: { facingMode: "user" }, audio: true });
    return this.stream;
  }

  // Record `streamOverride` (e.g. a canvas-composited stream carrying burned-in
  // text) when provided; otherwise record the raw camera stream. The camera
  // stream is still stopped in stop() either way, so its tracks are released.
  startRecording(streamOverride?: MediaStream): void {
    if (!this.stream) throw new Error("camera not started");
    const recordStream = streamOverride ?? this.stream;
    this.mime = this.pickMime();
    this.chunks = [];
    this.recorder = this.makeRecorder(recordStream, this.mime);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.mime || "video/mp4" }));
      };
      if (!this.recorder) return finish();
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }
}
