// @vitest-environment jsdom
// 🎒 アイテム（2026-09-26）— 稽古1回で何がもらえるか、アプリ全体で見たとき。
//
// 決まり:
//   🧊 ブロック … 最後までやり切った稽古 1回で 1つ（1・3・5…回め）
//   🥋 帯      … メニューの帯が1つ上がるたびに 1本
//   ✨ キラキラ … 帯 5本ごとに 1つ
//   🏆 トロフィー … 帯 10本ごとに 1つ
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { savePreset } from "../../karate-trainer/src/preset-store";
import { setSelectedPreset, setDrillLevel } from "../../karate-trainer/src/menu-belt-store";
import { practiceCount, unlockedBlocks } from "../../karate-trainer/src/block-store";
import { BLOCKS } from "../../karate-trainer/src/block-catalog";
import { beltCount, setEarnedBelts, trophies } from "../../karate-trainer/src/belt-collection-store";
import { loadUnlocked } from "../../karate-trainer/src/sparkle-store";

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
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}
beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

/// 2秒の種目1つのメニューを、最後までやり切る。
async function practiceOnce(root: HTMLElement, storage: Storage): Promise<void> {
  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb: (d: number) => void) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  } as any);
  await app.start();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));
}

it("1回めの稽古で ブロックが1つ開き、done 画面がそれを言う", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();

  await practiceOnce(root, storage);

  const mem = scopedStorage(storage, getActiveId(storage));
  expect(practiceCount(mem)).toBe(1);
  expect(unlockedBlocks(mem).map((b) => b.id)).toEqual([BLOCKS[0].id]);
  expect(root.querySelector("[data-block-award]")!.textContent).toContain(BLOCKS[0].name);
});

it("とちゅうで終了した稽古は 回数に数えない", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb: (d: number) => void) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }],
  } as any);
  await app.start();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 3000; t += 250) loopCb!(250);
  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));

  const mem = scopedStorage(storage, getActiveId(storage));
  expect(practiceCount(mem)).toBe(0);
  expect(root.querySelector("[data-block-award]")).toBeNull();
});

it("帯が1つ上がると 帯を1本もらい、5本めで キラキラが1つ開く", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  const kihon = [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" as const }];
  const preset = savePreset("基本", kihon, storage)!;
  const mem = scopedStorage(storage, getActiveId(storage));
  setSelectedPreset(preset.id, mem);
  // あと1回で帯が上がるところまで積んでおく。
  setDrillLevel(preset.id, "前蹴り", 9, mem);
  // すでに4本もらっている ＝ この1本で キラキラが開く。
  setEarnedBelts([0, 0, 0, 0], mem);
  const before = loadUnlocked(mem);

  await practiceOnce(root, storage);

  expect(beltCount(mem)).toBe(5);
  const after = loadUnlocked(mem);
  expect(after.length).toBe(before.length + 1);
  expect(root.querySelector("[data-sparkle-award]")).not.toBeNull();
  // 同じ稽古で ブロックももらえる（もらいものは じゃまし合わない）。
  expect(root.querySelector("[data-block-award]")).not.toBeNull();
});

it("帯 10本めで トロフィーをもらう", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  const kihon = [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" as const }];
  const preset = savePreset("基本", kihon, storage)!;
  const mem = scopedStorage(storage, getActiveId(storage));
  setSelectedPreset(preset.id, mem);
  setDrillLevel(preset.id, "前蹴り", 9, mem);
  setEarnedBelts([0, 0, 0, 0, 0, 0, 0, 0, 0], mem);

  await practiceOnce(root, storage);

  expect(trophies(mem)).toHaveLength(1);
  const line = root.querySelector("[data-trophy-award]")!;
  expect(line.textContent).toContain("トロフィー");
  // 種目の名前は入れない。
  expect(line.textContent).not.toContain("空手");
});

it("帯が上がらない稽古では 帯は増えない（ブロックだけ）", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  const kihon = [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" as const }];
  const preset = savePreset("基本", kihon, storage)!;
  const mem = scopedStorage(storage, getActiveId(storage));
  setSelectedPreset(preset.id, mem);
  setEarnedBelts([0], mem);

  await practiceOnce(root, storage);

  expect(beltCount(mem)).toBe(1);
  expect(root.querySelector("[data-sparkle-award]")).toBeNull();
  expect(root.querySelector("[data-block-award]")).not.toBeNull();
});
