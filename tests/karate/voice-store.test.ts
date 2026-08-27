import { describe, it, expect, beforeEach, vi } from "vitest";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";

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
});
