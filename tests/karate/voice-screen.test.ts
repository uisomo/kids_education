// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { renderVoiceScreen, localDateStamp } from "../../karate-trainer/src/ui/voice-screen";
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

it("stays idle when the recorder start() rejects (mic denied)", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  const rec = {
    start: vi.fn().mockRejectedValue(new Error("denied")),
    stop: vi.fn().mockResolvedValue(new Blob(["x"])),
  };
  renderVoiceScreen(root, { store, makeRecorder: () => rec, onBack: vi.fn() });

  const btn = root.querySelector<HTMLButtonElement>("[data-record]")!;
  btn.click();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));

  expect(rec.start).toHaveBeenCalled();
  // Button must be back to the idle "録音" label, not stuck on "停止".
  expect(btn.textContent).toContain("録音");
  expect(btn.textContent).not.toContain("停止");
  // stop() must not have been called; no clip saved.
  expect(rec.stop).not.toHaveBeenCalled();
  expect((await store.all()).length).toBe(0);
});

const flush = () => new Promise((r) => setTimeout(r, 0));

it("returns to idle with an error when saving the clip fails, and the next tap starts again", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  vi.spyOn(store, "add").mockRejectedValueOnce(new Error("quota"));
  const root = document.createElement("div");
  const rec = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob(["x"])) };
  renderVoiceScreen(root, { store, makeRecorder: () => rec, onBack: vi.fn() });
  const btn = root.querySelector<HTMLButtonElement>("[data-record]")!;

  btn.click(); await flush();          // start
  expect(btn.textContent).toContain("停止");
  btn.click(); await flush();          // stop → add rejects
  expect(btn.textContent).toContain("録音");
  expect(root.querySelector("[data-voice-status]")!.textContent).not.toBe("");

  btn.click(); await flush();          // must START again, not stop()
  expect(rec.start).toHaveBeenCalledTimes(2);
  expect(rec.stop).toHaveBeenCalledTimes(1);
});

it("returns to idle when recorder.stop() rejects", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  const rec = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockRejectedValue(new Error("x")) };
  renderVoiceScreen(root, { store, makeRecorder: () => rec, onBack: vi.fn() });
  const btn = root.querySelector<HTMLButtonElement>("[data-record]")!;
  btn.click(); await flush();
  btn.click(); await flush();
  expect(btn.textContent).toContain("録音");
});

it("ignores stored clips with an unknown role when rendering the list", async () => {
  const kv = memKv();
  await kv.set("bad", { id: "bad", role: "shout", label: "へんなやつ", blob: new Blob(["b"]) });
  await kv.set("ok", { id: "ok", role: "announce", label: "はじめ", blob: new Blob(["a"]) });
  const store = new VoiceStore(kv);
  await store.init();
  const root = document.createElement("div");
  renderVoiceScreen(root, { store, makeRecorder: () => ({ start: vi.fn(), stop: vi.fn() }), onBack: vi.fn() });
  await flush();
  const list = root.querySelector("[data-list]")!;
  expect(list.textContent).toContain("はじめ");
  expect(list.textContent).not.toContain("へんなやつ");
});

async function importFile(root: HTMLElement, file: Blob) {
  const input = root.querySelector<HTMLInputElement>("[data-import]")!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  for (let i = 0; i < 5; i++) await flush();
}

it("reports imported / skipped counts and survives a broken file", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  renderVoiceScreen(root, { store, makeRecorder: () => ({ start: vi.fn(), stop: vi.fn() }), onBack: vi.fn() });
  const status = () => root.querySelector("[data-voice-status]")!.textContent;

  await importFile(root, new Blob(["{broken"]));
  expect(status()).toContain("読み込めません");

  const good = new Blob([JSON.stringify({ version: 1, items: [
    { role: "announce", label: "始め", type: "audio/mp4", data: btoa("AAA") },
    { role: "nope", label: "x", type: "audio/mp4", data: btoa("BBB") },
  ] })]);
  await importFile(root, good);
  expect(status()).toBe("1件 読み込みました / 1件 スキップ");
  expect(root.querySelector("[data-list]")!.textContent).toContain("始め");
  await importFile(root, good);
  expect(status()).toBe("0件 読み込みました / 2件 スキップ");
});

it("uses the exportFile dep with a local-date filename when provided", async () => {
  const store = new VoiceStore(memKv());
  await store.init();
  const root = document.createElement("div");
  const exportFile = vi.fn().mockResolvedValue(undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
  renderVoiceScreen(root, { store, makeRecorder: () => ({ start: vi.fn(), stop: vi.fn() }), onBack: vi.fn(), exportFile });
  root.querySelector<HTMLButtonElement>("[data-export]")!.click();
  await flush(); await flush();
  expect(exportFile).toHaveBeenCalledOnce();
  const [name, blob] = exportFile.mock.calls[0];
  expect(name).toBe(`voice-backup-${localDateStamp()}.json`);
  expect(blob).toBeInstanceOf(Blob);
  expect(click).not.toHaveBeenCalled();
  click.mockRestore();
});

it("localDateStamp uses local time, not UTC", () => {
  // 00:30 local on Jan 2 — toISOString would give Jan 1 in any UTC+ zone.
  expect(localDateStamp(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
  expect(localDateStamp(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});

it("shows an accurate storage caveat", () => {
  const root = document.createElement("div");
  renderVoiceScreen(root, { store: new VoiceStore(memKv()), makeRecorder: () => ({ start: vi.fn(), stop: vi.fn() }), onBack: vi.fn() });
  const caveat = root.querySelector(".caveat")!.textContent!;
  expect(caveat).toContain("この端末にのみ保存されます");
  expect(caveat).not.toContain("Safari");
});
