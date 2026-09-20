// @vitest-environment jsdom
// Fixes from the 2026-09-20 phone test: the 🪝 hook words leaking onto the live
// screen, the 家族 tab's jump nav, どうがのかざり reverting to わく, the hook popup,
// and the 親御さんからのメッセージ bar at the top of 特訓.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp, type KarateAppDeps, type VideoRecorderLike } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { setPlan } from "../../karate-trainer/src/plan-store";
import { loadDecor } from "../../karate-trainer/src/decor-store";
import { getHook } from "../../karate-trainer/src/hook-store";
import { renderTrainingScreen } from "../../karate-trainer/src/ui/training-screen";
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

// --- (5) どうがのかざり reportedly reverts to わく ---
it("かざり keeps the picked option across re-renders and restarts", async () => {
  const storage = memStorage();
  setPlan("family", storage);        // so 「なし」 is not locked either
  const { root, openFamily } = await makeApp({ storage });
  await openFamily();

  root.querySelector<HTMLButtonElement>('[data-decor="icon"]')!.click();
  await settle();
  expect(loadDecor(storage)).toBe("icon");
  expect(root.querySelector('[data-decor="icon"]')!.classList.contains("on")).toBe(true);
  expect(root.querySelector('[data-decor="frame"]')!.classList.contains("on")).toBe(false);

  // Leave the tab and come back: still アラン, not back to わく.
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  await openFamily();
  expect(root.querySelector('[data-decor="icon"]')!.classList.contains("on")).toBe(true);

  // A fresh app over the same storage (app relaunch).
  const again = await makeApp({ storage });
  await again.openFamily();
  expect(again.root.querySelector('[data-decor="icon"]')!.classList.contains("on")).toBe(true);
});

it("かざり shows いまこれ on the picked option", async () => {
  const storage = memStorage();
  const { root, openFamily } = await makeApp({ storage });
  await openFamily();
  expect(root.querySelector('[data-decor="frame"] [data-decor-on]')).not.toBeNull();

  root.querySelector<HTMLButtonElement>('[data-decor="banner"]')!.click();
  await settle();
  expect(root.querySelector('[data-decor="frame"] [data-decor-on]')).toBeNull();
  expect(root.querySelector('[data-decor="banner"] [data-decor-on]')).not.toBeNull();
});

// --- (4) 家族 tab is enormous → sticky jump chips ---
it("家族 has jump chips for every section, and each one has a target", async () => {
  const { root, openFamily } = await makeApp();
  await openFamily();

  const chips = [...root.querySelectorAll<HTMLButtonElement>("[data-family-jump-to]")];
  expect(chips.map((c) => c.textContent)).toEqual(["メンバー", "設定", "使い方", "かざり", "プラン"]);
  for (const chip of chips) {
    const anchor = chip.dataset.familyJumpTo!;
    const target = root.querySelector(`[data-family-anchor="${anchor}"]`);
    expect(target, `no target for ${anchor}`).not.toBeNull();
    const into = vi.fn();
    (target as any).scrollIntoView = into;
    chip.click();
    expect(into).toHaveBeenCalled();
  }
});

// --- (6) the 🪝 words move into a popup ---
it("🪝 opens a popup for the three lines and leaves nothing on screen when off", async () => {
  const storage = memStorage();
  const { root, mem } = await makeApp({ storage });

  // Off: only the switch, no boxes anywhere.
  expect(root.querySelector("[data-hook-toggle]")).not.toBeNull();
  expect(root.querySelector("[data-hook-line]")).toBeNull();
  expect(root.querySelector("[data-hook-modal]")).toBeNull();

  root.querySelector<HTMLButtonElement>("[data-hook-toggle]")!.click();
  expect(getHook(mem()).on).toBe(true);
  const card = root.querySelector("[data-hook-modal]")!;
  expect(card).not.toBeNull();
  expect(card.textContent).toContain("さいしょに出てくる言葉だよ。なににする？");
  expect([...card.querySelectorAll(".hook-modal-label")].map((l) => l.textContent))
    .toEqual(["1ぎょうめ", "2ぎょうめ", "3ぎょうめ"]);

  // Typing saves as it goes, clamped to 6 characters a line.
  const lines = card.querySelectorAll<HTMLInputElement>("[data-hook-line]");
  expect(lines.length).toBe(3);
  lines[0].value = "いち に";
  lines[0].dispatchEvent(new Event("input"));
  lines[1].value = "さんしごろくしち";
  lines[1].dispatchEvent(new Event("input"));
  expect(lines[1].value).toBe("さんしごろく");
  expect(getHook(mem()).text).toBe("いち に\nさんしごろく");

  // これでOK closes it; the switch stays on.
  root.querySelector<HTMLButtonElement>("[data-hook-modal-close]")!.click();
  expect(root.querySelector("[data-hook-modal]")).toBeNull();
  expect(getHook(mem()).on).toBe(true);
  expect(root.querySelector(".hook-toggle-btn")!.classList.contains("is-on")).toBe(true);

  // Tapping 🪝 while on reopens the card with what was typed (no re-typing).
  root.querySelector<HTMLButtonElement>("[data-hook-toggle]")!.click();
  expect(getHook(mem()).on).toBe(true);          // still on: it only edits
  expect(root.querySelector<HTMLInputElement>('[data-hook-line="0"]')!.value).toBe("いち に");

  // つかわない turns it off and takes everything off the screen.
  root.querySelector<HTMLButtonElement>("[data-hook-off]")!.click();
  expect(getHook(mem()).on).toBe(false);
  expect(root.querySelector("[data-hook-modal]")).toBeNull();
  expect(root.querySelector("[data-hook-line]")).toBeNull();
  expect(getHook(mem()).text).toBe("いち に\nさんしごろく");   // words kept for next time
});

// --- (1) the 🪝 words stayed on the live training screen ---
it("clearing the hook takes the words out of the DOM, and showing it puts them back", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const view = renderTrainingScreen(root);

  // Before the hook: nothing (built hidden, but only inserted when shown).
  view.setTexts([["いち", "に"], ["さん"]]);
  expect(root.querySelector("[data-text-grid]")).not.toBeNull();
  expect(root.querySelector("[data-read-hint]")).not.toBeNull();
  expect(root.querySelectorAll(".text-grid-word").length).toBe(3);
  expect(root.querySelector<HTMLElement>("[data-timer]")!.hidden).toBe(true);

  view.revealText(0);
  expect(root.querySelector(".text-grid-word")!.classList.contains("show")).toBe(true);

  // Cleared: gone entirely — `hidden` alone left a stale layer painted on iOS.
  view.setTexts(null);
  expect(root.querySelector("[data-text-grid]")).toBeNull();
  expect(root.querySelector("[data-read-hint]")).toBeNull();
  expect(root.querySelector(".text-grid-word")).toBeNull();
  expect(root.querySelector<HTMLElement>("[data-timer]")!.hidden).toBe(false);

  // A second hook (next practice on the same view) re-inserts them.
  view.setTexts([["ろく"]]);
  expect(root.querySelectorAll(".text-grid-word").length).toBe(1);
  expect(root.querySelector(".text-grid-word")!.classList.contains("show")).toBe(false);

  // An empty grid counts as off.
  view.setTexts([[], []]);
  expect(root.querySelector("[data-text-grid]")).toBeNull();
});
