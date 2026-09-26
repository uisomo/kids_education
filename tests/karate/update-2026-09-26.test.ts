// @vitest-environment jsdom
// 2026-09-26 の5つの直し:
//   1. 🏆 トロフィーは **同じ色の帯（音符）5本**で その色のもの。棚には色ごとの数
//   2. 家族タブの上のチップは 折り返して ぜんぶ見える（中身は「保護者へ」に）
//   3. 使い方どうがは 特訓タブの 🎬 から（家族タブからは外した）
//   4. 「10びょうで やってみる？」と ★レビューは、動画を保存したことがあるかで出しわけ
//   5. 動画の保存に 保護者ゲートは無い（空手・ピアノとも）
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp, type KarateAppDeps, type VideoRecorderLike } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { renderItemScreen } from "../../karate-trainer/src/ui/item-screen";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { renderFamilyScreen } from "../../karate-trainer/src/ui/family-screen";
import {
  setEarnedBelts, trophies, trophyCounts, beltsToNextTrophyFor, BELTS_PER_TROPHY, gainedTrophy,
} from "../../karate-trainer/src/belt-collection-store";
import { BELTS } from "../../karate-trainer/src/belt-store";
import { hasSavedVideo, markVideoSaved, resetSavedVideos, savedVideoCount } from "../../karate-trainer/src/saved-video-store";
import { shouldOfferGuide, markGuideSkipped } from "../../karate-trainer/src/guide-store";
import { shouldAskReview } from "../../karate-trainer/src/review-store";
import { HOWTO_VIDEOS } from "../../karate-trainer/src/ui/howto";
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
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

beforeEach(() => {
  localStorage.clear();
  document.body.textContent = "";
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
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const deps: KarateAppDeps = {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => rec,
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    saveRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: menu,
    ...over,
  };
  const app = new KarateApp(root, deps);
  await app.start();
  return {
    root, storage, deps,
    startSession: async () => {
      root.querySelector<HTMLButtonElement>("[data-start]")!.click();
      await settle();
    },
    pump: (ms: number) => { for (let t = 0; t < ms; t += 250) loopCb!(250); },
    mem: () => scopedStorage(storage, getActiveId(storage)),
  };
}

// --- 1. 🏆 同じ色を5本 ------------------------------------------------------

it("トロフィーは 同じ色を5本あつめた色の分だけ（ばらけた10本では もらえない）", () => {
  const store = memStorage();
  setEarnedBelts([0, 0, 0, 1, 1], store);
  expect(trophyCounts(store)[0]).toBe(0);
  expect(trophies(store)).toHaveLength(0);

  setEarnedBelts([0, 0, 0, 0, 0, 1, 1], store);
  expect(trophies(store)).toHaveLength(1);
  expect(trophies(store)[0].index).toBe(0);
  expect(trophies(store)[0].fill).toBe(BELTS[0].fill);
  expect(beltsToNextTrophyFor(1, store)).toBe(BELTS_PER_TROPHY - 2);
});

it("増えた1つは 色を見て見つける（後ろに足されるとは限らない）", () => {
  const store = memStorage();
  setEarnedBelts([0, 0, 0, 0, 0, 2, 2, 2, 2], store);
  const before = trophies(store);
  setEarnedBelts([0, 0, 0, 0, 0, 2, 2, 2, 2, 2], store);
  const got = gainedTrophy(before, trophies(store));
  expect(got?.index).toBe(2);
  expect(got?.name).toBe(trophies(store)[1].name);
});

it("アイテムの帯の棚は 色ごとに 何本あつめたかの数を出す", () => {
  const store = memStorage();
  setEarnedBelts([0, 0, 0, 1], store);
  const root = document.createElement("div");
  renderItemScreen(root, { storage: store, section: "belt" });

  const white = root.querySelector<HTMLElement>('[data-belt="0"]')!;
  expect(white.textContent).toContain("×3");
  expect(white.textContent).toContain("あと2本で 🏆");
  const yellow = root.querySelector<HTMLElement>('[data-belt="1"]')!;
  expect(yellow.textContent).toContain("×1");
  // 決まりも書いておく（何をすると もらえるか）。
  expect(root.querySelector("[data-belt-hint]")!.textContent).toContain(`${BELTS_PER_TROPHY}本`);
  // まだ持っていない色に 数は出さない。
  expect(root.querySelector<HTMLElement>('[data-belt="3"]')!.textContent).not.toContain("×");
});

// --- 2 と 3. 家族タブの上のチップ／使い方どうが ------------------------------

it("使い方どうが は 特訓タブの 🎬 から開く", () => {
  const root = document.createElement("div");
  document.body.append(root);
  renderSetupScreen(root, {
    menu, onChange: vi.fn(), onEdit: vi.fn(), onStart: vi.fn(),
    presets: [], onSavePreset: vi.fn(), onLoadPreset: vi.fn(), onDeletePreset: vi.fn(),
  });

  const chip = root.querySelector<HTMLButtonElement>("[data-howto-chip]")!;
  expect(chip.textContent).toBe("🎬");
  expect(chip.closest(".toybox-header")).not.toBeNull();

  chip.click();
  const list = root.querySelector("[data-howto-menu]")!;
  expect([...list.querySelectorAll("[data-howto]")]).toHaveLength(HOWTO_VIDEOS.length);

  // 1つ押すと その動画がひらき、とじると 一覧ごと片づく。
  list.querySelector<HTMLButtonElement>('[data-howto="menu"]')!.click();
  expect(root.querySelector("[data-howto-video]")).not.toBeNull();
  root.querySelector<HTMLButtonElement>("[data-howto-menu-close]")!.click();
  expect(root.querySelector("[data-howto-menu]")).toBeNull();
  expect(root.querySelector("[data-howto-modal]")).toBeNull();
});

it("家族タブから 使い方どうが は無くなり、チップは「保護者へ」を指す", () => {
  const root = document.createElement("div");
  renderFamilyScreen(root, {
    members: [{ id: "m1", name: "アラン" }],
    activeId: "m1",
    onSelect: vi.fn(), onAdd: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(),
    activePlan: "free", onSelectPlan: vi.fn(),
  } as any);

  expect(root.querySelector("[data-howto-list]")).toBeNull();
  const chips = [...root.querySelectorAll<HTMLElement>("[data-family-jump-to]")];
  expect(chips.map((c) => c.textContent)).toContain("保護者へ");
  expect(chips.map((c) => c.textContent)).not.toContain("使い方");
  // チップの行き先（保護者の方へ）がちゃんとある。
  expect(root.querySelector('[data-family-anchor="parent"]')).not.toBeNull();
});

// --- 4. 保存したことがあるか で出しわけ -------------------------------------

it("「10びょうで やってみる？」は 動画を保存したことがない人だけ", () => {
  const store = memStorage();
  expect(shouldOfferGuide(store)).toBe(true);
  markGuideSkipped(store);
  expect(shouldOfferGuide(store)).toBe(true);
  markVideoSaved(store);
  expect(shouldOfferGuide(store)).toBe(false);
  // テスト用「初回ガイドをやり直す」で 記録も消えるので また出る。
  resetSavedVideos(store);
  expect(shouldOfferGuide(store)).toBe(true);
});

it("★レビューは 動画を保存したことがある人だけ（2日めから）", () => {
  const store = memStorage();
  const day1 = new Date(2026, 8, 26, 9);
  const day2 = new Date(2026, 8, 27, 9);
  expect(shouldAskReview(store, day1)).toBe(false);
  // 2日めでも、まだ1本も保存していない人には聞かない。
  expect(shouldAskReview(store, day2)).toBe(false);
  markVideoSaved(store);
  expect(shouldAskReview(store, day2)).toBe(true);
});

it("保存できたら 記録がつく（★の出しわけに使う）", async () => {
  const { root, storage, startSession, pump, deps } = await makeApp();
  expect(hasSavedVideo(storage)).toBe(false);
  await startSession();
  pump(2500);
  await settle();

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  await settle();
  expect(deps.saveRecording).toHaveBeenCalledOnce();
  expect(hasSavedVideo(storage)).toBe(true);
  expect(savedVideoCount(storage)).toBe(1);

  // --- 5. 保存に 保護者ゲートは立たない（空手・ピアノとも 同じコード）。
  expect(root.querySelector("[data-gate-overlay]")).toBeNull();
  expect(document.querySelector("[data-gate-overlay]")).toBeNull();
});

it("保存できなかったときは 記録をつけない", async () => {
  const saveRecording = vi.fn().mockRejectedValue(new Error("no space"));
  const { root, storage, startSession, pump } = await makeApp({ saveRecording });
  await startSession();
  pump(2500);
  await settle();
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  await settle();
  expect(hasSavedVideo(storage)).toBe(false);
});
