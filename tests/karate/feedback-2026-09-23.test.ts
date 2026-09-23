// @vitest-environment jsdom
// The 2026-09-23 list: the date burned into the saved video, the ★ rating ask
// from the second day on, 🪝 words picked for you (じどう / チェンジ) and the
// hook's colours changing every practice so two thumbnails never match.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp, videoDateLabel, type KarateAppDeps, type VideoRecorderLike } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { getHook, setHook, getHookPick, setHookPick } from "../../karate-trainer/src/hook-store";
import { HOOK_PRESETS, presetText, nextPresetIndex } from "../../karate-trainer/src/hook-presets";
import { HOOK_PALETTES, hookPalette, hookFill, nextHookPalette } from "../../karate-trainer/src/hook-style";
import { MAX_TEXT_CHARS, MAX_TEXT_LINES } from "../../karate-trainer/src/drill-texts";
import { shouldAskReview, markReviewAsked } from "../../karate-trainer/src/review-store";
import { openHookModal } from "../../karate-trainer/src/ui/hook-modal";
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

async function makeApp(over: Partial<KarateAppDeps> = {}) {
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
    ...over,
  };
  const app = new KarateApp(root, deps);
  await app.start();
  const mem = () => scopedStorage(storage, getActiveId(storage));
  const runSession = async () => {
    root.querySelector<HTMLButtonElement>("[data-start]")!.click();
    await settle();
    for (let t = 0; t < 2500; t += 250) loopCb!(250);
    await settle();
  };
  return { root, storage, rec, mem, runSession };
}

// --- 1. 日付 ---

it("writes the day of the practice into the saved video", async () => {
  expect(videoDateLabel(new Date(2026, 8, 23))).toBe("📅 2026年9月23日(水)");
  expect(videoDateLabel(new Date(2027, 0, 1))).toBe("📅 2027年1月1日(金)");

  const { rec, runSession } = await makeApp();
  await runSession();
  // Fifth argument: the labels burned into the video, beside 🔥 and the 帯.
  expect((rec.stop as any).mock.calls[0][4].dateLabel).toBe(videoDateLabel(new Date()));
});

// --- 3. ★ 二日目以降のレビュー ---

it("asks for a rating from the second day on, and not every day after that", () => {
  const storage = memStorage();
  const day1 = new Date(2026, 8, 23, 9);
  // First launch only remembers the day — nobody rates an app they just got.
  expect(shouldAskReview(storage, day1)).toBe(false);
  expect(shouldAskReview(storage, new Date(2026, 8, 23, 20))).toBe(false);

  const day2 = new Date(2026, 8, 24, 9);
  expect(shouldAskReview(storage, day2)).toBe(true);
  markReviewAsked(storage, day2);
  expect(shouldAskReview(storage, day2)).toBe(false);
  expect(shouldAskReview(storage, new Date(2026, 9, 24))).toBe(false);   // a month later: too soon

  // Two months on it may ask again, but never more than three times in all.
  const later = new Date(2026, 10, 24);
  expect(shouldAskReview(storage, later)).toBe(true);
  markReviewAsked(storage, later);
  const later2 = new Date(2027, 1, 24);
  expect(shouldAskReview(storage, later2)).toBe(true);
  markReviewAsked(storage, later2);
  expect(shouldAskReview(storage, new Date(2027, 6, 24))).toBe(false);
});

// --- 4. 🪝 じどう / チェンジ ---

it("keeps every preset inside the three boxes' 6 characters", () => {
  expect(HOOK_PRESETS).toHaveLength(20);
  for (const preset of HOOK_PRESETS) {
    expect(preset).toHaveLength(MAX_TEXT_LINES);
    for (const line of preset) {
      expect([...line].length).toBeGreaterThan(0);
      expect([...line].length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    }
  }
  // 「教えてください」 is 7 characters, which is why they all say 下さい.
  expect(HOOK_PRESETS.some((p) => p.includes("教えて下さい"))).toBe(true);
  expect(HOOK_PRESETS.flat().some((line) => line.includes("ください") && line !== "ください")).toBe(false);
});

it("never draws the same preset (or palette) twice in a row", () => {
  for (let i = 0; i < HOOK_PRESETS.length; i++) {
    for (const r of [0, 0.3, 0.99]) {
      expect(nextPresetIndex(i, () => r)).not.toBe(i);
      expect(nextHookPalette(i % HOOK_PALETTES.length, () => r)).not.toBe(i % HOOK_PALETTES.length);
    }
  }
  // Nothing picked yet: any of them will do.
  expect(nextPresetIndex(null, () => 0)).toBe(0);
});

it("🪝 じどう uses a preset instead of the typed words, a new one each practice", async () => {
  const storage = memStorage();
  const { mem, rec, runSession } = await makeApp({ storage });
  setHook({ on: true, text: "あいう\nえお\nかき", auto: true }, mem());

  await runSession();
  const first = (rec.stop as any).mock.calls[0][0]
    .filter((e: any) => e.patch.texts?.length).at(-1).patch.texts.flat().join("\n");
  expect(HOOK_PRESETS.map((p) => p.join("\n"))).toContain(first);
  expect(first).not.toContain("あいう");

  const used = getHookPick(mem()).preset;
  expect(used).not.toBeNull();
  expect(presetText(used!)).toBe(first);
});

it("🪝 じどう off still reads the typed words", async () => {
  const storage = memStorage();
  const { mem, rec, runSession } = await makeApp({ storage });
  setHook({ on: true, text: "あいう\nえお", auto: false }, mem());

  await runSession();
  const lines = (rec.stop as any).mock.calls[0][0]
    .filter((e: any) => e.patch.texts?.length).at(-1).patch.texts.flat();
  expect(lines).toEqual(["あいう", "えお"]);
});

it("the 🪝 card's じどう switch greys out the boxes; チェンジ fills them", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const edits: string[] = [];
  let auto = false;
  openHookModal(host, {
    text: "",
    auto: false,
    onEditText: (t) => edits.push(t),
    onToggleAuto: (on) => { auto = on; },
    onTurnOff: () => {},
  });

  const change = host.querySelector<HTMLButtonElement>("[data-hook-change]")!;
  change.click();
  const filled = [...host.querySelectorAll<HTMLInputElement>("[data-hook-line]")].map((i) => i.value);
  expect(HOOK_PRESETS).toContainEqual(filled);
  expect(edits.at(-1)).toBe(filled.join("\n"));
  expect(auto).toBe(false);   // チェンジ fills the boxes, it does not turn じどう on

  // A second tap gives different words.
  change.click();
  const again = [...host.querySelectorAll<HTMLInputElement>("[data-hook-line]")].map((i) => i.value);
  expect(again).not.toEqual(filled);

  const box = host.querySelector<HTMLInputElement>("[data-hook-auto]")!;
  box.checked = true;
  box.dispatchEvent(new Event("change"));
  expect(auto).toBe(true);
  expect([...host.querySelectorAll<HTMLInputElement>("[data-hook-line]")].every((i) => i.disabled)).toBe(true);
  expect(change.disabled).toBe(true);
  // The typed words are kept, just unused.
  expect([...host.querySelectorAll<HTMLInputElement>("[data-hook-line]")].map((i) => i.value)).toEqual(again);
});

it("remembers じどう per member", async () => {
  const storage = memStorage();
  const { root, mem } = await makeApp({ storage });
  setHook({ on: true, text: "", auto: true }, mem());
  expect(getHook(mem()).auto).toBe(true);
  root.querySelector<HTMLButtonElement>("[data-hook-toggle]")!.click();
  await settle();
  expect(document.querySelector<HTMLInputElement>("[data-hook-auto]")?.checked).toBe(true);
  // Close it: an open card's MutationObserver outlives the test environment.
  root.querySelector<HTMLButtonElement>("[data-hook-modal-close]")!.click();
  await settle();
});

// --- 5. 🪝 の色 ---

it("paints each practice's hook in its own palette, live and in the video", async () => {
  const storage = memStorage();
  const { root, mem, rec, runSession } = await makeApp({ storage });
  setHook({ on: true, text: "いち\nに\nさん", auto: false }, mem());
  setHookPick({ palette: 0 }, mem());

  await runSession();
  const palette = getHookPick(mem()).palette!;
  expect(palette).not.toBe(0);               // never the same as last time
  const logged = (rec.stop as any).mock.calls[0][0].filter((e: any) => e.patch.texts?.length);
  expect(logged.at(-1).patch.textPalette).toBe(palette);
  expect(logged.at(-1).patch.textColorMode).toBe("line");
  expect(root).toBeTruthy();
});

it("gives the live words the palette's colours and drop", async () => {
  const { renderTrainingScreen } = await import("../../karate-trainer/src/ui/training-screen");
  const root = document.createElement("div");
  document.body.append(root);
  const view = renderTrainingScreen(root);

  view.setTexts([["いち"], ["に"], ["さん"]], 3);
  const grid = root.querySelector<HTMLElement>("[data-text-grid]")!;
  const colors = hookPalette(3);
  expect(grid.style.getPropertyValue("--hook-drop")).toBe(colors.drop);
  const words = [...root.querySelectorAll<HTMLElement>(".text-grid-word")];
  expect(words.map((w) => w.style.color))
    .toEqual([0, 1, 2].map((row) => hexToRgb(hookFill(colors, "line", row, 0))));
});

it("has a colour for every line of every palette", () => {
  expect(HOOK_PALETTES.length).toBeGreaterThanOrEqual(6);
  for (const p of HOOK_PALETTES) {
    expect(p.fills).toHaveLength(MAX_TEXT_LINES);
    for (const c of [...p.fills, p.drop]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  }
});

// jsdom reports style.color as rgb().
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
