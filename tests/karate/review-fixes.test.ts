// @vitest-environment jsdom
// Fixes from the 2026-09 review: plan locks instead of deletes, share gate,
// start/interruption recovery, pause, backup, setup/done screen guards.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp, type KarateAppDeps, type VideoRecorderLike } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId, addMember, loadMembers } from "../../karate-trainer/src/member-store";
import { loadBelt } from "../../karate-trainer/src/belt-store";
import { loadMenuBelt, setMenuBelt } from "../../karate-trainer/src/menu-belt-store";
import { countFor } from "../../karate-trainer/src/progress-store";
import { setPlan } from "../../karate-trainer/src/plan-store";
import { loadPresets, savePreset } from "../../karate-trainer/src/preset-store";
import { addKufu, latestKufu, canAddKufu } from "../../karate-trainer/src/kufu-store";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";
import {
  snapshotStorage, restoreIfEmpty, mirroredStorage, makeBackupScheduler,
} from "../../karate-trainer/src/storage-backup";
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
    menuOverride: menu,
    askParentalGate: vi.fn().mockResolvedValue(true),
    ...over,
  };
  const app = new KarateApp(root, deps);
  await app.start();
  const startSession = async () => {
    root.querySelector<HTMLButtonElement>("[data-start]")!.click();
    await settle();
  };
  const pump = (ms: number) => { for (let t = 0; t < ms; t += 250) loopCb!(250); };
  return { root, storage, deps, rec, startSession, pump, mem: () => scopedStorage(storage, getActiveId(storage)) };
}

// --- plan downgrade locks, never deletes ---
it("presets past the plan's cap stay stored but are hidden from the dropdown", async () => {
  const storage = memStorage();
  savePreset("A", menu, storage);
  savePreset("B", menu, storage);
  savePreset("C", menu, storage);
  setPlan("free", storage);
  const { root } = await makeApp({ storage });
  const options = [...root.querySelectorAll<HTMLOptionElement>("[data-preset-select] option")].filter((o) => o.value);
  expect(options.map((o) => o.textContent)).toEqual(["A"]);
  expect(loadPresets(storage)).toHaveLength(3);   // nothing deleted
});

it("工夫 for 種目 past the plan's cap is locked, not deleted", () => {
  const s = memStorage();
  addKufu("突き", "a", s);
  addKufu("蹴り", "b", s);
  const free = { perDrill: 1, total: 1 };
  expect(latestKufu("蹴り", s, free)).toBe("");       // locked on Free
  expect(canAddKufu("蹴り", s, free)).toBe(false);
  expect(latestKufu("突き", s, free)).toBe("a");
  expect(latestKufu("蹴り", s)).toBe("b");          // back on upgrade
});

// --- share needs the parental gate ---
it("sharing the video asks the parental gate first", async () => {
  const gate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { root, deps, startSession, pump } = await makeApp({ askParentalGate: gate });
  await startSession();
  pump(2500);
  await settle();
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  await settle();
  expect(deps.shareRecording).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  await settle();
  expect(deps.shareRecording).toHaveBeenCalledOnce();
});

// --- start failure / interruption ---
it("a failed recording start tears the camera down and offers Settings", async () => {
  const openSettings = vi.fn();
  const { root, deps, rec, startSession } = await makeApp(
    { openSettings },
    { startRecording: vi.fn().mockRejectedValue(new Error("mic denied")) },
  );
  await startSession();
  expect(rec.cancel).toHaveBeenCalled();
  expect(deps.wakeGuard.release).toHaveBeenCalled();
  expect(root.querySelector("[data-setup-status]")!.textContent).toContain("カメラかマイク");
  root.querySelector<HTMLButtonElement>("[data-setup-status-action]")!.click();
  expect(openSettings).toHaveBeenCalledOnce();
  expect(root.querySelector("[data-start]")).not.toBeNull();
});

it("an interrupted recording ends the practice with no credit", async () => {
  let interrupt: ((r: string) => void) | null = null;
  const { root, startSession, pump, mem } = await makeApp({}, {
    onInterrupted: (cb) => { interrupt = cb; },
  });
  await startSession();
  pump(1000);
  interrupt!("phone call");
  await settle();
  expect(root.querySelector("[data-belt-result]")!.textContent).toContain("録画がとちゅうで止まった");
  expect(countFor("前蹴り", mem())).toBe(0);
  expect(loadBelt(mem())).toEqual({ index: 0, bars: 0 });
});

// --- pause ---
it("⏸ pauses the music and ▶ brings it back; hiding the app pauses", async () => {
  const bgm = { unlock: vi.fn(), play: vi.fn(), stop: vi.fn(), setMuted: vi.fn(), isMuted: vi.fn(() => false) };
  const { root, startSession, pump, mem } = await makeApp({ bgm, menuOverride: [{ id: "a", name: "前蹴り", seconds: 5, kind: "drill" }] });
  await startSession();
  root.querySelector<HTMLButtonElement>("[data-pause]")!.click();
  expect(bgm.setMuted).toHaveBeenLastCalledWith(true);
  pump(10000);   // paused: the drill must not finish
  expect(root.querySelector("[data-belt-result]")).toBeNull();
  root.querySelector<HTMLButtonElement>("[data-pause]")!.click();
  expect(bgm.setMuted).toHaveBeenLastCalledWith(false);

  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  expect(root.querySelector("[data-pause]")!.textContent).toContain("再開");
  expect(loadBelt(mem())).toEqual({ index: 0, bars: 0 });
});

// --- setup screen guards ---
function setupDeps(over: Record<string, unknown> = {}) {
  return {
    menu: structuredClone(menu) as Menu, onChange: vi.fn(), onEdit: vi.fn(), onStart: vi.fn(), presets: [],
    onSavePreset: vi.fn(), onLoadPreset: vi.fn(), onDeletePreset: vi.fn(), ...over,
  };
}

it("an empty menu can't be started", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, setupDeps({ menu: [] }));
  expect(root.querySelector<HTMLButtonElement>("[data-start]")!.disabled).toBe(true);
});

it("seconds are whole numbers between 1 and 3600", () => {
  const root = document.createElement("div");
  const onEdit = vi.fn();
  renderSetupScreen(root, setupDeps({ onEdit }));
  const secs = root.querySelector<HTMLInputElement>(".drill-secs")!;
  secs.value = "1.5"; secs.dispatchEvent(new Event("input"));
  expect(onEdit.mock.calls.at(-1)![0][0].seconds).toBe(2);
  secs.value = "99999"; secs.dispatchEvent(new Event("input"));
  expect(onEdit.mock.calls.at(-1)![0][0].seconds).toBe(3600);
});

it("a selected menu can be overwritten with 上書き保存", () => {
  const root = document.createElement("div");
  const onOverwritePreset = vi.fn();
  const presets = [{ id: "p1", name: "A", menu }];
  renderSetupScreen(root, setupDeps({ presets, selectedPresetId: "p1", onOverwritePreset }));
  root.querySelector<HTMLButtonElement>("[data-preset-overwrite]")!.click();
  expect(onOverwritePreset).toHaveBeenCalledWith("p1");
});

// --- done screen: unsaved video ---
it("もう一度 asks before dropping an unsaved video", () => {
  const root = document.createElement("div");
  const onAgain = vi.fn();
  const confirm = vi.fn(() => false);
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4", stats: { time: "0:10", drills: 1, cues: 0 },
    onShare: vi.fn(), onAgain, confirm,
  });
  root.querySelector<HTMLButtonElement>("[data-again]")!.click();
  expect(confirm).toHaveBeenCalledOnce();
  expect(onAgain).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  root.querySelector<HTMLButtonElement>("[data-again]")!.click();
  expect(onAgain).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledOnce();   // no question once saved
});

// --- native backup ---
it("backs up only the app's keys and restores only into empty storage", () => {
  const s = memStorage();
  s.setItem("karate.members", "[1]");
  s.setItem("m:x:karate.belt", "{}");
  s.setItem("other", "no");
  const json = JSON.stringify(snapshotStorage(s));
  expect(JSON.parse(json)).toEqual({ "karate.members": "[1]", "m:x:karate.belt": "{}" });

  const fresh = memStorage();
  expect(restoreIfEmpty(fresh, json)).toBe(true);
  expect(fresh.getItem("m:x:karate.belt")).toBe("{}");

  const newer = memStorage();
  newer.setItem("karate.members", "[2]");
  expect(restoreIfEmpty(newer, json)).toBe(false);
  expect(newer.getItem("karate.members")).toBe("[2]");
  expect(restoreIfEmpty(memStorage(), "not json")).toBe(false);
});

it("writes are mirrored to the backup file, coalesced", async () => {
  vi.useFakeTimers();
  const base = memStorage();
  const write = vi.fn().mockResolvedValue(undefined);
  const backup = makeBackupScheduler(base, { read: vi.fn(), write }, 1000);
  const s = mirroredStorage(base, () => backup.schedule());
  s.setItem("karate.menu", "a");
  s.setItem("karate.menu", "ab");
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(write).toHaveBeenCalledOnce();
  expect(JSON.parse(write.mock.calls[0][0])).toEqual({ "karate.menu": "ab" });
  vi.useRealTimers();
});

// --- removing a member deletes their data, so it asks first ---
it("removing a member asks before deleting their records", async () => {
  const storage = memStorage();
  setPlan("family", storage);
  const hanako = addMember("はなこ", storage);
  setMenuBelt("p1", 3, scopedStorage(storage, hanako.id));
  const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  const { root } = await makeApp({ storage, confirm });

  root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  const [a, b] = root.querySelector("[data-gate-question]")!.textContent!.match(/\d+/g)!.map(Number);
  root.querySelector<HTMLInputElement>("[data-gate-input]")!.value = String(a * b);
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();

  root.querySelector<HTMLButtonElement>(`[data-member-del="${hanako.id}"]`)!.click();
  expect(confirm.mock.calls[0][0]).toContain("はなこ");
  expect(loadMembers(storage)).toHaveLength(2);                      // cancelled: kept
  expect(loadMenuBelt("p1", scopedStorage(storage, hanako.id)).belt).toBe(3);

  root.querySelector<HTMLButtonElement>(`[data-member-del="${hanako.id}"]`)!.click();
  expect(loadMembers(storage).map((m) => m.name)).not.toContain("はなこ");
  expect(storage.getItem(`m:${hanako.id}:karate.menuBelts`)).toBeNull();  // records gone
});


it("not enough free space stops the practice before the camera opens", async () => {
  const { root, rec, startSession } = await makeApp({}, { freeDiskBytes: vi.fn().mockResolvedValue(1_000_000) });
  await startSession();
  expect(rec.startCamera).not.toHaveBeenCalled();
  expect(root.querySelector("[data-setup-status]")!.textContent).toContain("空き容量が足りません");
  expect(root.querySelector("[data-start]")).not.toBeNull();
});

it("Premium keeps 5 menus: the 6th save is refused with a message", async () => {
  const storage = memStorage();
  setPlan("premium", storage);
  let n = 0;
  const { root } = await makeApp({ storage, promptName: () => `メニュー${++n}` });
  for (let i = 0; i < 6; i++) {
    // After a save that menu is picked (保存 hides), so start a new one first.
    const select = root.querySelector<HTMLSelectElement>("[data-preset-select]")!;
    select.value = "";
    select.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>("[data-preset-save]")!.click();
  }
  expect(loadPresets(storage)).toHaveLength(5);
  expect(root.querySelector("[data-setup-status]")!.textContent).toContain("プランの上限");
});
