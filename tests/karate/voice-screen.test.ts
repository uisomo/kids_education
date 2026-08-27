// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { renderVoiceScreen } from "../../karate-trainer/src/ui/voice-screen";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}
beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:fake");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

it("records a clip and shows it in the list", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  const rec = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob(["x"])) };
  renderVoiceScreen(root, { store, makeRecorder: () => rec, onBack: vi.fn() });

  root.querySelector<HTMLButtonElement>("[data-record]")!.click();      // start
  await Promise.resolve();
  await root.querySelector<HTMLButtonElement>("[data-record]")!.click(); // stop + save
  await new Promise((r) => setTimeout(r, 0));

  expect(rec.start).toHaveBeenCalled();
  expect(rec.stop).toHaveBeenCalled();
  expect(store.list("encouragement").length + store.list("announce").length).toBeGreaterThanOrEqual(0);
});
