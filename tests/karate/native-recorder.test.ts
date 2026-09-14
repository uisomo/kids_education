import { describe, it, expect } from "vitest";
import { NativeVideoRecorder, type KarateRecorderPluginLike } from "../../karate-trainer/src/native-recorder";
import type { OverlayEvent } from "../../karate-trainer/src/overlay-event-log";

function makePlugin(overrides: Partial<KarateRecorderPluginLike> = {}) {
  const calls: string[] = [];
  let received: Parameters<KarateRecorderPluginLike["stopRecording"]>[0] | null = null;
  const plugin: KarateRecorderPluginLike = {
    async startPreview() { calls.push("startPreview"); },
    async playMusic() { /* unused here */ },
    async setMusicPaused() { /* unused here */ },
    async stopMusic() { /* unused here */ },
    async playClip() { /* unused here */ },
    async stopPreview() { calls.push("stopPreview"); },
    async startRecording() { calls.push("startRecording"); },
    async stopRecording(opts) {
      calls.push("stopRecording");
      received = opts;
      return { uri: "file:///tmp/karate.mp4", burnedIn: true };
    },
    ...overrides,
  };
  return { plugin, calls, got: () => received };
}

function makeRecorder(plugin: KarateRecorderPluginLike, classCalls: boolean[] = []) {
  return new NativeVideoRecorder({
    plugin,
    toWebPath: (uri) => `capacitor://localhost/_capacitor_file_${uri}`,
    fetchBlob: async (url) => new Blob([url], { type: "video/mp4" }),
    setPreviewClass: (on) => { classCalls.push(on); },
  });
}

describe("NativeVideoRecorder", () => {
  it("drives the plugin through the full preview/record/stop lifecycle", async () => {
    const { plugin, calls } = makePlugin();
    const rec = makeRecorder(plugin);

    await rec.startCamera();
    await rec.startRecording();
    await rec.stop([], 0);

    expect(calls).toEqual(["startPreview", "startRecording", "stopRecording", "stopPreview"]);
  });

  it("hands the overlay event log to the native burn-in instead of ffmpeg", async () => {
    const { plugin, got } = makePlugin();
    const rec = makeRecorder(plugin);
    const events: OverlayEvent[] = [
      { t: 0, patch: { drill: "正拳突き" } },
      { t: 1000, patch: { seconds: 3 } },
    ];

    await rec.startCamera();
    await rec.startRecording();
    await rec.stop(events, 4000);

    expect(got()).toEqual({ events, totalDurationMs: 4000, menu: [], sounds: [] });
  });

  it("passes the session menu through for the 特訓一覧 panel", async () => {
    const { plugin, got } = makePlugin();
    const rec = makeRecorder(plugin);
    const menu = [
      { name: "前蹴り", seconds: 30, kind: "drill" as const },
      { name: "休憩", seconds: 15, kind: "rest" as const },
    ];

    await rec.startCamera();
    await rec.startRecording();
    await rec.stop([], 1000, menu);

    expect(got()?.menu).toEqual(menu);
  });

  it("passes played sounds through for the echo-cancelled mix", async () => {
    const { plugin, got } = makePlugin();
    const rec = makeRecorder(plugin);
    const sounds = [
      { t: 3500, kind: "bgm" as const, playing: true, restart: true, src: "/characters/bgm.mp3" },
      { t: 9000, kind: "clip" as const, src: "/characters/cheer/alan-3.mov" },
    ];

    await rec.startCamera();
    await rec.startRecording();
    await rec.stop([], 12000, [], sounds);

    expect(got()?.sounds).toEqual(sounds);
  });

  it("exposes the on-disk file so sharing skips the base64 round trip", async () => {
    const { plugin } = makePlugin();
    const rec = makeRecorder(plugin);

    expect(rec.fileUri()).toBeNull();
    await rec.startCamera();
    await rec.startRecording();
    await rec.stop([], 0);

    expect(rec.fileUri()).toBe("file:///tmp/karate.mp4");
    expect(rec.fileExtension()).toBe("mp4");
  });

  it("reads the finished video back through the web-path conversion", async () => {
    const { plugin } = makePlugin();
    const rec = makeRecorder(plugin);

    await rec.startCamera();
    await rec.startRecording();
    const blob = await rec.stop([], 0);

    expect(await blob.text()).toBe("capacitor://localhost/_capacitor_file_file:///tmp/karate.mp4");
  });

  it("toggles the transparency class only while the preview is up", async () => {
    const { plugin } = makePlugin();
    const classCalls: boolean[] = [];
    const rec = makeRecorder(plugin, classCalls);

    await rec.startCamera();
    expect(classCalls).toEqual([true]);
    await rec.startRecording();
    await rec.stop([], 0);
    expect(classCalls).toEqual([true, false]);
  });

  it("surfaces a burn-in failure while still returning the raw recording", async () => {
    const { plugin } = makePlugin({
      async stopRecording() {
        return { uri: "file:///tmp/raw.mov", burnedIn: false, burnError: "export failed: no disk space" };
      },
    });
    const rec = makeRecorder(plugin);

    await rec.startCamera();
    await rec.startRecording();
    const blob = await rec.stop([], 0);

    expect(blob.size).toBeGreaterThan(0);
    expect(rec.didBurnIn()).toBe(false);
    expect(rec.burnError()).toBe("export failed: no disk space");
  });

  it("still resolves when preview teardown fails", async () => {
    const { plugin } = makePlugin({
      async stopPreview() { throw new Error("session already gone"); },
    });
    const rec = makeRecorder(plugin);

    await rec.startCamera();
    await rec.startRecording();
    await expect(rec.stop([], 0)).resolves.toBeInstanceOf(Blob);
  });
});

describe("NativeVideoRecorder with a real Capacitor-style plugin proxy", () => {
  // Capacitor's registerPlugin() returns a Proxy that turns EVERY property,
  // including `then`, into a native method call. If the recorder ever returns
  // that proxy from an async function (or awaits it), JS treats it as a
  // thenable, calls proxy.then(resolve, reject), and waits forever for a
  // native "then" method that doesn't exist. On device this left the app stuck
  // on the 準備中 loading screen with no error.
  function capacitorStyleProxy(calls: string[]): KarateRecorderPluginLike {
    return new Proxy({}, {
      get: (_target, prop) => async () => {
        calls.push(String(prop));
        if (prop === "then") return new Promise(() => { /* native never answers */ });
        return { uri: "file:///tmp/karate.mp4", burnedIn: true };
      },
    }) as KarateRecorderPluginLike;
  }

  const withinMs = <T>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`hung for ${ms}ms`)), ms)),
    ]);

  it("starts the camera without treating the plugin as a promise", async () => {
    const calls: string[] = [];
    const rec = makeRecorder(capacitorStyleProxy(calls));

    await expect(withinMs(rec.startCamera(), 500)).resolves.toBeDefined();
    expect(calls).not.toContain("then");
    expect(calls).toContain("startPreview");
  });

  it("completes a full record cycle through the proxy", async () => {
    const calls: string[] = [];
    const rec = makeRecorder(capacitorStyleProxy(calls));

    await withinMs(rec.startCamera(), 500);
    await withinMs(rec.startRecording(), 500);
    await expect(withinMs(rec.stop([], 0), 500)).resolves.toBeInstanceOf(Blob);
    expect(calls).not.toContain("then");
  });
});
