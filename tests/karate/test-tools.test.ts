// @vitest-environment jsdom
// test アプリ (com.alan.karate.test): テスト用 controls in the 家族 tab.
import { it, expect, vi } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { BASIC_PRESET_ID, BASIC_PRESET } from "../../karate-trainer/src/preset-store";
import { currentStreak, setStreakDays } from "../../karate-trainer/src/streak-store";
import { drillNames, levelOf, loadMenuBelt, recordPractice, setDrillLevel, MAX_LEVEL } from "../../karate-trainer/src/menu-belt-store";
import { renderFamilyScreen } from "../../karate-trainer/src/ui/family-screen";
import type { Menu } from "../../karate-trainer/src/types";

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

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    entries: async () => [...m.entries()],
  };
}

it("setStreakDays sets a streak ending today, and 0 clears it", () => {
  const s = memStorage();
  const now = new Date(2026, 8, 17, 9);
  setStreakDays(30, s, now);
  expect(currentStreak(s, now)).toBe(30);
  expect(currentStreak(s, new Date(2026, 8, 18, 9))).toBe(30);   // still alive tomorrow
  setStreakDays(0, s, now);
  expect(currentStreak(s, now)).toBe(0);
});

it("setDrillLevel clamps to 0..10, keeps the belt, and never promotes by itself", () => {
  const s = memStorage();
  const menu: Menu = [
    { id: "a", name: "前蹴り", seconds: 30, kind: "drill" },
    { id: "b", name: "回し蹴り", seconds: 30, kind: "drill" },
  ];
  setDrillLevel("p1", "前蹴り", 99, s);
  setDrillLevel("p1", "回し蹴り", -3, s);
  let mb = loadMenuBelt("p1", s);
  expect(levelOf(mb, "前蹴り")).toBe(MAX_LEVEL);
  expect(levelOf(mb, "回し蹴り")).toBe(0);
  expect(mb.belt).toBe(0);

  // Everything parked at 9 → one full practice goes up a belt.
  drillNames(menu).forEach((n) => setDrillLevel("p1", n, MAX_LEVEL - 1, s));
  expect(recordPractice("p1", menu, ["前蹴り", "回し蹴り"], s).promoted).toBe(true);
  mb = loadMenuBelt("p1", s);
  expect(mb.belt).toBe(1);
});

it("the family screen shows テスト用 only when testTools is passed, and wires its controls", () => {
  const base = {
    members: [{ id: "m1", name: "じぶん" }], activeId: "m1",
    onAddMember: vi.fn(), onRemoveMember: vi.fn(), onSelectMember: vi.fn(),
    activePlan: "free" as const, onSelectPlan: vi.fn(),
  };
  const root = document.createElement("div");
  renderFamilyScreen(root, base);
  expect(root.querySelector("[data-test-tools]")).toBeNull();

  const tools = {
    streakDays: 3, onSetStreak: vi.fn(),
    menus: [{ id: "p1", name: "基本", drills: [{ name: "前蹴り", level: 4 }] }],
    onSetLevel: vi.fn(), onSetAllLevels: vi.fn(),
  };
  renderFamilyScreen(root, { ...base, testTools: tools });
  expect(root.querySelector("[data-test-tools]")).not.toBeNull();

  const input = root.querySelector<HTMLInputElement>("[data-test-streak-input]")!;
  expect(input.value).toBe("3");
  input.value = "45";
  root.querySelector<HTMLButtonElement>("[data-test-streak-set]")!.click();
  expect(tools.onSetStreak).toHaveBeenCalledWith(45);

  const level = root.querySelector<HTMLSelectElement>('[data-test-level="p1:前蹴り"]')!;
  expect(level.value).toBe("4");
  level.value = "10";
  level.dispatchEvent(new Event("change"));
  expect(tools.onSetLevel).toHaveBeenCalledWith("p1", "前蹴り", 10);

  root.querySelector<HTMLButtonElement>('[data-test-all-levels="p1:9"]')!.click();
  expect(tools.onSetAllLevels).toHaveBeenCalledWith("p1", 9);
});

async function openFamily(testTools: boolean) {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
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
    testTools,
  });
  await app.start();
  root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  const [a, b] = root.querySelector("[data-gate-question]")!.textContent!.match(/\d+/g)!.map(Number);
  root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(a * b);
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
  return { root, storage };
}

it("the App Store build (testTools off) has no テスト用 section", async () => {
  const { root } = await openFamily(false);
  expect(root.querySelector("[data-plan-card]")).not.toBeNull();
  expect(root.querySelector("[data-test-tools]")).toBeNull();
});

it("the test app sets the active kid's streak and 基本's drill levels from the 家族 tab", async () => {
  const { root, storage } = await openFamily(true);
  const mem = scopedStorage(storage, getActiveId(storage));

  root.querySelector<HTMLInputElement>("[data-test-streak-input]")!.value = "100";
  root.querySelector<HTMLButtonElement>("[data-test-streak-set]")!.click();
  expect(currentStreak(mem)).toBe(100);
  expect(root.querySelector("[data-test-tools]")!.textContent).toContain("100日");

  root.querySelector<HTMLButtonElement>(`[data-test-all-levels="${BASIC_PRESET_ID}:10"]`)!.click();
  const mb = loadMenuBelt(BASIC_PRESET_ID, mem);
  expect(drillNames(BASIC_PRESET.menu).every((n) => levelOf(mb, n) === 10)).toBe(true);

  // Plans switch for free (no billing): Family is one tap.
  root.querySelector<HTMLButtonElement>('[data-plan-card="family"]')!.click();
  expect(root.querySelector('[data-plan-card="family"]')!.classList.contains("active")).toBe(true);
});
