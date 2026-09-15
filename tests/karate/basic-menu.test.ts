// @vitest-environment jsdom
// Built-in 基本: every new kid starts on it, it can't be overwritten or
// deleted, and it doesn't use a plan's menu slots.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { addMember, getActiveId, setActive } from "../../karate-trainer/src/member-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { loadMenu, saveMenu, totalSeconds } from "../../karate-trainer/src/menu-store";
import { BASIC_PRESET_ID, loadPresets, updatePreset } from "../../karate-trainer/src/preset-store";
import { getSelectedPreset } from "../../karate-trainer/src/menu-belt-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => { document.body.textContent = ""; });

async function makeApp(storage: Storage, names: string[] = []) {
  const root = document.createElement("div");
  document.body.append(root);
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
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    promptName: () => names.shift() ?? null,
  });
  await app.start();
  return root;
}

const select = (root: HTMLElement) => root.querySelector<HTMLSelectElement>("[data-preset-select]")!;

it("a first-time kid starts on 基本: five moves with 休憩 between, 30 s each, already picked", async () => {
  const storage = memStorage();
  const root = await makeApp(storage);
  const mem = scopedStorage(storage, getActiveId(storage));

  const menu = loadMenu(mem);
  expect(menu.map((d) => d.name)).toEqual(["正拳突き", "休憩", "上段揚げ受け", "休憩", "前蹴り", "休憩", "下段払い", "休憩", "回し蹴り"]);
  expect(menu.map((d) => d.kind)).toEqual(["drill", "rest", "drill", "rest", "drill", "rest", "drill", "rest", "drill"]);
  expect(menu.every((d) => d.seconds === 30)).toBe(true);
  expect(totalSeconds(menu)).toBe(270);
  expect(getSelectedPreset(mem)).toBe(BASIC_PRESET_ID);

  expect(root.querySelectorAll("[data-row]")).toHaveLength(9);
  expect(select(root).selectedOptions[0].textContent).toBe("基本");
  // Read-only: no 上書き保存 / メニュー削除, but 「保存」 makes a copy.
  expect(root.querySelector("[data-preset-overwrite]")).toBeNull();
  expect(root.querySelector("[data-preset-del]")).toBeNull();
  expect(root.querySelector("[data-preset-save]")).not.toBeNull();
  expect(loadPresets(storage)).toHaveLength(0);   // never stored
});

it("基本 doesn't use the Free plan's one menu slot", async () => {
  const storage = memStorage();
  const root = await makeApp(storage, ["じぶんのメニュー", "ふたつめ"]);

  root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  expect(loadPresets(storage).map((p) => p.name)).toEqual(["じぶんのメニュー"]);
  expect([...select(root).options].map((o) => o.textContent)).toEqual(["＋ 新しいメニューを作る", "基本", "じぶんのメニュー"]);

  // A second menu of their own is past Free's cap.
  select(root).value = "";
  select(root).dispatchEvent(new Event("change"));
  root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  expect(loadPresets(storage)).toHaveLength(1);
  expect(root.textContent).toContain("プランの上限です");
});

it("a saved menu already named 基本 keeps its name; the built-in one becomes 基本（標準）", async () => {
  const storage = memStorage();
  const first = getActiveId(storage);
  saveMenu([{ id: "a", name: "前蹴り", seconds: 30, kind: "drill" }], scopedStorage(storage, first));
  const { savePreset } = await import("../../karate-trainer/src/preset-store");
  savePreset("基本", loadMenu(scopedStorage(storage, first)), storage);
  const root = await makeApp(storage);
  expect([...select(root).options].map((o) => o.textContent)).toEqual(["＋ 新しいメニューを作る", "基本（標準）", "基本"]);
});

it("基本 can't be overwritten through the store", () => {
  const s = memStorage();
  expect(updatePreset(BASIC_PRESET_ID, [{ id: "x", name: "x", seconds: 10, kind: "drill" }], s)).toBe(false);
});

it("kids who already have a menu keep it; a newly added kid starts on 基本", async () => {
  const storage = memStorage();
  const first = getActiveId(storage);
  const mine = [{ id: "a", name: "平安初段", seconds: 60, kind: "drill" as const }];
  saveMenu(mine, scopedStorage(storage, first));
  const taro = addMember("たろう", storage);
  setActive(first, storage);   // adding made たろう active
  storage.setItem("karate.householdPlan", "family");   // so たろう is usable

  const root = await makeApp(storage);
  expect(loadMenu(scopedStorage(storage, first))).toEqual(mine);
  expect(getSelectedPreset(scopedStorage(storage, first))).toBeNull();
  expect(select(root).value).toBe("");

  // Switching to たろう lands them on 基本.
  root.querySelector<HTMLElement>(`[data-member="${taro.id}"]`)!.click();
  expect(getSelectedPreset(scopedStorage(storage, taro.id))).toBe(BASIC_PRESET_ID);
  expect(loadMenu(scopedStorage(storage, taro.id))[0].name).toBe("正拳突き");
});
