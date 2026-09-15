import { describe, it, expect, vi } from "vitest";
import {
  NativeVideoRecorder,
  openAppSettings,
  type KarateRecorderPluginLike,
} from "../../karate-trainer/src/native-recorder";
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

  it("does not read the finished video into the web view; exposes a playback URL instead", async () => {
    const { plugin } = makePlugin();
    const rec = makeRecorder(plugin);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(rec.playbackUrl()).toBeNull();
    await rec.startCamera();
    await rec.startRecording();
    const blob = await rec.stop([], 0);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(blob.size).toBe(0);
    expect(rec.playbackUrl()).toBe("capacitor://localhost/_capacitor_file_file:///tmp/karate.mp4");
  });

  it("stops the preview even when stopRecording fails", async () => {
    const classCalls: boolean[] = [];
    const { plugin, calls } = makePlugin({
      async stopRecording() { calls.push("stopRecording"); throw new Error("not recording"); },
    });
    const rec = makeRecorder(plugin, classCalls);

    await rec.startCamera();
    await rec.startRecording();
    await expect(rec.stop([], 0)).rejects.toThrow("not recording");

    expect(calls).toEqual(["startPreview", "startRecording", "stopRecording", "stopPreview"]);
    expect(classCalls).toEqual([true, false]);
    expect(rec.playbackUrl()).toBeNull();
  });

  it("reports mov when the raw capture came back", async () => {
    const { plugin } = makePlugin({
      async stopRecording() { return { uri: "file:///tmp/karate-raw-1.mov", burnedIn: false, exportMode: "raw" as const }; },
    });
    const rec = makeRecorder(plugin);

    expect(rec.fileExtension()).toBe("mp4");
    await rec.startCamera();
    await rec.startRecording();
    const blob = await rec.stop([], 0);
    expect(rec.fileExtension()).toBe("mov");
    expect(blob.type).toBe("video/quicktime");
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
    await rec.stop([], 0);

    expect(rec.fileUri()).toBe("file:///tmp/raw.mov");
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

describe("NativeVideoRecorder interruptions", () => {
  function listenablePlugin() {
    const base = makePlugin();
    let listener: ((data: { reason?: string }) => void) | null = null;
    const removed: string[] = [];
    base.plugin.addListener = async (eventName, fn) => {
      base.calls.push(`addListener ${eventName}`);
      listener = fn;
      return { remove: async () => { removed.push(eventName); listener = null; } };
    };
    const fire = (reason?: string) => listener?.(reason === undefined ? {} : { reason });
    return { ...base, fire, removed, hasListener: () => listener !== null };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("subscribes once and forwards the reason", async () => {
    const { plugin, calls, fire } = listenablePlugin();
    const rec = makeRecorder(plugin);
    const reasons: string[] = [];

    rec.onInterrupted((r) => reasons.push(r));
    rec.onInterrupted((r) => reasons.push(`second:${r}`));
    await flush();
    fire("background");
    fire();

    expect(calls.filter((c) => c.startsWith("addListener"))).toEqual(["addListener recordingInterrupted"]);
    expect(reasons).toEqual(["second:background", "second:unknown"]);
  });

  it("removes the listener on stop, which still returns the partial recording", async () => {
    const { plugin, fire, removed, hasListener } = listenablePlugin();
    plugin.stopRecording = async () => ({ uri: "file:///tmp/karate-training-x.mp4", burnedIn: true, interruption: "background" });
    const rec = makeRecorder(plugin);
    const reasons: string[] = [];

    await rec.startCamera();
    await rec.startRecording();
    rec.onInterrupted((r) => reasons.push(r));
    await flush();
    fire("cameraBackground");
    await expect(rec.stop([], 1000)).resolves.toBeInstanceOf(Blob);
    await flush();

    expect(reasons).toEqual(["cameraBackground"]);
    expect(removed).toEqual(["recordingInterrupted"]);
    expect(hasListener()).toBe(false);
    expect(rec.fileUri()).toBe("file:///tmp/karate-training-x.mp4");
  });

  it("removes the listener on cancel", async () => {
    const { plugin, removed } = listenablePlugin();
    const rec = makeRecorder(plugin);

    rec.onInterrupted(() => {});
    await rec.cancel();
    await flush();

    expect(removed).toEqual(["recordingInterrupted"]);
  });

  it("ignores interruption subscription on a plugin without events", () => {
    const { plugin } = makePlugin();
    const rec = makeRecorder(plugin);
    expect(() => rec.onInterrupted(() => {})).not.toThrow();
  });
});

describe("NativeVideoRecorder.cancel", () => {
  it("asks native to cancel and drops the transparency class", async () => {
    const classCalls: boolean[] = [];
    const { plugin, calls } = makePlugin({
      async cancelRecording() { calls.push("cancelRecording"); },
    });
    const rec = makeRecorder(plugin, classCalls);

    await rec.startCamera();
    await rec.cancel();

    expect(calls).toEqual(["startPreview", "cancelRecording"]);
    expect(classCalls).toEqual([true, false]);
  });

  it("never rejects, falling back to stopPreview when cancel fails", async () => {
    const { plugin, calls } = makePlugin({
      async cancelRecording() { calls.push("cancelRecording"); throw new Error("boom"); },
      async stopPreview() { calls.push("stopPreview"); throw new Error("gone"); },
    });
    const rec = makeRecorder(plugin);

    await expect(rec.cancel()).resolves.toBeUndefined();
    expect(calls).toEqual(["cancelRecording", "stopPreview"]);
  });

  it("works with an older native build that has no cancelRecording", async () => {
    const { plugin, calls } = makePlugin();
    const rec = makeRecorder(plugin);

    await expect(rec.cancel()).resolves.toBeUndefined();
    expect(calls).toEqual(["stopPreview"]);
  });

  it("never rejects even when the class toggle throws", async () => {
    const { plugin } = makePlugin();
    const rec = new NativeVideoRecorder({
      plugin,
      setPreviewClass: () => { throw new Error("no document"); },
    });
    await expect(rec.cancel()).resolves.toBeUndefined();
  });
});

describe("openAppSettings", () => {
  it("is a no-op off native", async () => {
    const openSettings = vi.fn(async () => {});
    const { plugin } = makePlugin({ openSettings });
    await openAppSettings({ plugin, isNative: false });
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("defaults to a no-op in the browser test environment", async () => {
    await expect(openAppSettings()).resolves.toBeUndefined();
  });

  it("opens settings on native and swallows failures", async () => {
    const openSettings = vi.fn(async () => { throw new Error("denied"); });
    const { plugin } = makePlugin({ openSettings });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(openAppSettings({ plugin, isNative: true })).resolves.toBeUndefined();
    expect(openSettings).toHaveBeenCalledTimes(1);
    warn.mockRestore();
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

  it("subscribes to interruptions and cancels through the proxy without hanging", async () => {
    const calls: string[] = [];
    const rec = makeRecorder(capacitorStyleProxy(calls));

    rec.onInterrupted(() => {});
    await withinMs(rec.startCamera(), 500);
    await expect(withinMs(rec.cancel(), 500)).resolves.toBeUndefined();
    expect(calls).toContain("addListener");
    expect(calls).toContain("cancelRecording");
    expect(calls).not.toContain("then");
  });

  it("passes the 🔥 streak and belt labels to the native burn-in", async () => {
    const { plugin, got } = makePlugin();
    const rec = makeRecorder(plugin);
    await rec.startCamera();
    await rec.startRecording();
    await rec.stop([], 1000, [], [], { streakLabel: "🔥 3日間 毎日継続中", beltLabel: "🟢 緑帯" });
    expect(got()).toMatchObject({ streakLabel: "🔥 3日間 毎日継続中", beltLabel: "🟢 緑帯" });
  });
});
