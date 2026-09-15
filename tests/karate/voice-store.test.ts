import { describe, it, expect, beforeEach, vi } from "vitest";
import { VoiceStore, VoiceImportError, type KvAdapter } from "../../karate-trainer/src/voice-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    entries: async () => [...m.entries()],
  };
}

beforeEach(() => {
  // jsdom lacks URL.createObjectURL
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:fake");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

describe("VoiceStore", () => {
  it("adds a clip and lists it by role", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    await store.add("encouragement", "もっと早く", new Blob(["x"]));
    expect(store.list("encouragement")).toHaveLength(1);
    expect(store.list("announce")).toHaveLength(0);
  });

  it("persists across a fresh instance on the same kv", async () => {
    const kv = memKv();
    const a = new VoiceStore(kv);
    await a.init();
    await a.add("announce", "始め", new Blob(["y"]));
    const b = new VoiceStore(kv);
    await b.init();
    expect(b.list("announce")).toHaveLength(1);
  });

  it("removes a clip", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    const clip = await store.add("countdown", "3", new Blob(["z"]));
    await store.remove(clip.id);
    expect(store.list("countdown")).toHaveLength(0);
  });

  it("propagates a failing kv request instead of hanging", async () => {
    const failingKv: KvAdapter = {
      get: async () => undefined,
      set: async () => { throw new Error("quota"); },
      delete: async () => undefined,
      entries: async () => [],
    };
    const store = new VoiceStore(failingKv);
    await store.init();
    await expect(store.add("announce", "x", new Blob(["y"]))).rejects.toThrow("quota");
  });

  const b64 = (str: string) => Buffer.from(str).toString("base64");
  const backup = (items: unknown[]) => new Blob([JSON.stringify({ version: 1, items })]);

  it("imports valid clips and reports skipped invalid ones", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    const res = await store.import(backup([
      { role: "announce", label: "始め", type: "audio/mp4", data: b64("AAA") },
      { role: "shout", label: "unknown role", type: "audio/mp4", data: b64("BBB") },
      { role: "countdown", label: "bad b64", type: "audio/mp4", data: "!!!not base64!!!" },
      { role: "countdown", label: "no data", type: "audio/mp4" },
      { role: "countdown", label: "empty", type: "audio/mp4", data: "" },
      null,
      { role: "encouragement", label: "がんばれ", type: "audio/mp4", data: b64("CCC") },
    ]));
    expect(res).toEqual({ imported: 2, skipped: 5 });
    expect(store.list("announce")).toHaveLength(1);
    expect(store.list("encouragement")).toHaveLength(1);
    expect(store.list("countdown")).toHaveLength(0);
  });

  it("skips duplicates on a second import (same bytes, or same id)", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    const file = backup([
      { role: "announce", label: "a", type: "audio/mp4", data: b64("SAME") },
      { id: "fixed-id", role: "countdown", label: "b", type: "audio/mp4", data: b64("ONE") },
    ]);
    expect(await store.import(file)).toEqual({ imported: 2, skipped: 0 });
    expect(await store.import(file)).toEqual({ imported: 0, skipped: 2 });
    // Same id with different bytes is still treated as already present.
    expect(await store.import(backup([
      { id: "fixed-id", role: "countdown", label: "b2", type: "audio/mp4", data: b64("TWO") },
    ]))).toEqual({ imported: 0, skipped: 1 });
    // Same bytes under a different role is a different clip.
    expect(await store.import(backup([
      { role: "encouragement", label: "c", type: "audio/mp4", data: b64("SAME") },
    ]))).toEqual({ imported: 1, skipped: 0 });
    // Duplicates inside one file collapse too.
    expect(await store.import(backup([
      { role: "countdown", label: "d", type: "audio/mp4", data: b64("DUP") },
      { role: "countdown", label: "e", type: "audio/mp4", data: b64("DUP") },
    ]))).toEqual({ imported: 1, skipped: 1 });
    expect((await store.all()).length).toBe(4);
  });

  it("skips clips matching an existing recording's bytes", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    await store.add("announce", "rec", new Blob(["HELLO"]));
    expect(await store.import(backup([
      { role: "announce", label: "x", type: "", data: b64("HELLO") },
    ]))).toEqual({ imported: 0, skipped: 1 });
  });

  it("throws VoiceImportError for a file that is not a backup", async () => {
    const store = new VoiceStore(memKv());
    await store.init();
    await expect(store.import(new Blob(["{not json"]))).rejects.toBeInstanceOf(VoiceImportError);
    await expect(store.import(new Blob(['{"items":5}']))).rejects.toBeInstanceOf(VoiceImportError);
    await expect(store.import(new Blob(["null"]))).rejects.toBeInstanceOf(VoiceImportError);
  });

  it("does not reuse ids across launches when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const kv = memKv();
      vi.resetModules();
      const A = (await import("../../karate-trainer/src/voice-store")).VoiceStore;
      const a = new A(kv);
      await a.init();
      const c1 = await a.add("announce", "1", new Blob(["1"]));
      vi.resetModules();   // simulate an app relaunch: module state starts over
      const B = (await import("../../karate-trainer/src/voice-store")).VoiceStore;
      const b = new B(kv);
      await b.init();
      const c2 = await b.add("announce", "2", new Blob(["2"]));
      expect(c2.id).not.toBe(c1.id);
      expect((await kv.entries()).length).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("init ignores stored records without a blob", async () => {
    const kv = memKv();
    await kv.set("junk", { id: "junk", role: "announce", label: "x" });
    const store = new VoiceStore(kv);
    await expect(store.init()).resolves.toBeUndefined();
    expect(await store.all()).toEqual([]);
  });
});
