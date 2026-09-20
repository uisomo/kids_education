// @vitest-environment jsdom
// Fixes from the 2026-09-21 phone test: the 家族 tab's pinned jump bar running
// into the phone's clock, and 設定 listing a 帯 dropdown for every saved menu
// instead of just the one picked in 「メニュー」 above it.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp, type KarateAppDeps, type VideoRecorderLike } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import type { Menu } from "../../karate-trainer/src/types";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

const menu: Menu = [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }];

async function makeApp(over: Partial<KarateAppDeps> = {}, recorder: Partial<VideoRecorderLike> = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = (over.storage as Storage | undefined) ?? memStorage();
  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const rec: VideoRecorderLike = {
    startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
    startRecording: vi.fn(),
    stop: vi.fn().mockResolvedValue(new Blob(["v"])),
    fileExtension: () => "mp4",
    cancel: vi.fn().mockResolvedValue(undefined),
    ...recorder,
  };
  const deps: KarateAppDeps = {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => rec,
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    hookStepMs: 0,
    menuOverride: menu,
    askParentalGate: vi.fn().mockResolvedValue(true),
    ...over,
  };
  const app = new KarateApp(root, deps);
  await app.start();
  const openFamily = async () => {
    root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
    await settle();
    // First visit puts up the parental gate (a × b = ?); answer it.
    const q = root.querySelector("[data-gate-question]");
    if (q) {
      const [a, b] = q.textContent!.match(/\d+/g)!.map(Number);
      root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(a * b);
      root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
      await settle();
    }
  };
  const startSession = async () => {
    root.querySelector<HTMLButtonElement>("[data-start]")!.click();
    await settle();
  };
  const pump = (ms: number) => { for (let t = 0; t < ms; t += 250) loopCb!(250); };
  return { root, storage, deps, rec, openFamily, startSession, pump,
           mem: () => scopedStorage(storage, getActiveId(storage)) };
}

// --- 家族: the pinned bar must own the strip behind the status bar ---
it("puts the jump bar first on the 家族 screen, above the 家族 title", async () => {
  const { root, openFamily } = await makeApp();
  await openFamily();

  // CSS pulls this first child up over the screen's safe-area padding, so its
  // own background — not the scrolling page — sits behind the phone's clock.
  const first = root.firstElementChild!;
  expect(first.classList.contains("family-jump-nav")).toBe(true);
  expect(first.querySelectorAll("[data-family-jump-to]")).toHaveLength(5);
  expect(root.querySelector(".screen-title")!.textContent).toBe("家族");
});

// --- 設定: one 帯, for the menu picked just above it ---
it("shows the 帯 only for the menu picked in メニュー", async () => {
  const storage = memStorage();
  storage.setItem("karate.presets", JSON.stringify([
    { id: "p2", name: "型", menu: [{ id: "k", name: "平安初段", seconds: 30, kind: "drill" }] },
  ]));
  // No menuOverride: the app gives a fresh kid the built-in 基本, picked.
  const { root, openFamily } = await makeApp({ storage, menuOverride: undefined });
  await openFamily();

  // A fresh kid is on 基本: its 帯 is the only one on screen.
  const belts = () => [...root.querySelectorAll<HTMLSelectElement>("[data-belt-select]")]
    .map((s) => s.dataset.beltSelect);
  expect(belts()).toEqual(["basic"]);

  // Picking 型 in メニュー swaps the 帯 — it never stacks one per saved menu.
  const pick = root.querySelector<HTMLSelectElement>("[data-class-select]")!;
  pick.value = "p2";
  pick.dispatchEvent(new Event("change"));
  await settle();
  expect(belts()).toEqual(["p2"]);
  expect(root.querySelector('[data-belt-row="p2"]')!.textContent).toContain("型の帯を変える");
});

// 「なし」 leaves the kid on whatever menu they have open on 特訓, so the 帯 stays.
it("keeps the open menu's 帯 when メニュー is set to なし", async () => {
  const { root, openFamily } = await makeApp({ menuOverride: undefined });
  await openFamily();

  const pick = root.querySelector<HTMLSelectElement>("[data-class-select]")!;
  pick.value = "";
  pick.dispatchEvent(new Event("change"));
  await settle();
  expect([...root.querySelectorAll<HTMLSelectElement>("[data-belt-select]")]
    .map((s) => s.dataset.beltSelect)).toEqual(["basic"]);
});

// --- 🪝 のこりカス: the hook's words left a sliver over the camera ---
// The phone shows the camera on a NATIVE layer behind a transparent web view,
// so pixels WebKit forgets to erase stay over the live picture. Removing the
// nodes was not enough (a band of the red drop shadow stayed mid-screen), so
// the screen is nudged to force a full re-rasterise.
it("nudges the training screen's opacity when the 🪝 words come off", async () => {
  const { renderTrainingScreen } = await import("../../karate-trainer/src/ui/training-screen");
  const root = document.createElement("div");
  document.body.append(root);
  const view = renderTrainingScreen(root);

  view.setTexts([["いち", "に"], ["さん"]]);
  expect(root.style.opacity).toBe("");

  view.setTexts(null);
  expect(root.querySelector("[data-text-grid]")).toBeNull();
  expect(root.style.opacity).toBe("0.996");   // repaint in flight

  // ...and it goes back to normal by itself (two frames later).
  await new Promise((r) => setTimeout(r, 80));
  expect(root.style.opacity).toBe("");
});
