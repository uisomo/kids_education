// @vitest-environment jsdom
// Practice credit on a saved menu: only drills that ran down to 0 level up;
// 休憩 and skipped drills don't, and an unsaved menu earns nothing.
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { savePreset } from "../../karate-trainer/src/preset-store";
import { loadMenuBelt, levelOf, beltStateFor, setSelectedPreset } from "../../karate-trainer/src/menu-belt-store";
import { SessionScheduler } from "../../karate-trainer/src/scheduler";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";
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
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

// Runs a session over `menu`; `drive(loop, skip)` plays it out.
// `saved`: the menu is a saved menu the member picked (so its belt fills).
async function run(
  menu: Menu,
  drive: (loop: (ms: number) => void, skip: () => void) => void,
  { saved = true }: { saved?: boolean } = {},
) {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = memStorage();
  const mem = scopedStorage(storage, getActiveId(storage));
  const presetId = saved ? savePreset("基本", menu, storage)!.id : "";
  if (saved) setSelectedPreset(presetId, mem);
  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();
  const stop = vi.fn().mockResolvedValue(new Blob(["v"]));
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop,
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: menu,
  });
  await app.start();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await tick(); await tick();
  drive(
    (ms) => { for (let t = 0; t < ms; t += 250) loopCb!(250); },
    () => root.querySelector<HTMLButtonElement>("[data-skip]")!.click(),
  );
  for (let i = 0; i < 3; i++) await tick();
  const levels = () => loadMenuBelt(presetId, mem);
  return { root, mem, stop, level: (name: string) => levelOf(levels(), name), bars: () => beltStateFor(levels(), menu).bars };
}

const two: Menu = [
  { id: "a", name: "前蹴り", seconds: 2, kind: "drill" },
  { id: "b", name: "回し蹴り", seconds: 2, kind: "drill" },
];

it("the scheduler reports whether a drill ran to 0 or was skipped", () => {
  const onDrillEnd = vi.fn();
  const s = new SessionScheduler(two, {
    onDrillStart: vi.fn(), onTick: vi.fn(), onEncourage: vi.fn(), onCountdown: vi.fn(), onDrillEnd, onSessionEnd: vi.fn(),
  });
  s.start();
  s.skip();
  for (let t = 0; t < 2000; t += 250) s.tick(250);
  expect(onDrillEnd.mock.calls.map((c) => c[1])).toEqual([false, true]);
});

it("skipping every drill levels nothing up", async () => {
  const { root, level, bars } = await run(two, (_loop, skip) => { skip(); skip(); });
  expect(level("前蹴り")).toBe(0);
  expect(level("回し蹴り")).toBe(0);
  expect(bars()).toBe(0);
  expect(root.querySelector("[data-belt-result]")!.textContent).toContain("練習した種目がない");
  expect(root.querySelector(".done-title")!.textContent).toBe("おつかれさま！");
});

it("a skipped drill just doesn't level up; the finished one still does", async () => {
  const { root, level, bars } = await run(two, (loop, skip) => { loop(2250); skip(); });
  expect(level("前蹴り")).toBe(1);
  expect(level("回し蹴り")).toBe(0);
  expect(bars()).toBe(0);   // the belt follows the lowest drill
  expect(root.querySelector("[data-belt-result]")!.textContent).toBe("帯のバー 0/10");
  expect(root.querySelectorAll(".stat .v")[1].textContent).toBe("1");   // 種目 = finished drills
});

it("finishing every drill fills the belt bar; skipping a 休憩 is fine", async () => {
  const menu: Menu = [
    { id: "a", name: "前蹴り", seconds: 2, kind: "drill" },
    { id: "r", name: "休憩", seconds: 30, kind: "rest" },
  ];
  const { level, bars } = await run(menu, (loop, skip) => { loop(2250); skip(); });
  expect(level("前蹴り")).toBe(1);
  expect(level("休憩")).toBe(0);
  expect(bars()).toBe(1);
});

it("a 休憩-only menu earns nothing, and an empty menu can't start", async () => {
  const restOnly: Menu = [{ id: "r", name: "休憩", seconds: 2, kind: "rest" }];
  const a = await run(restOnly, (loop) => loop(2500));
  expect(a.bars()).toBe(0);
  expect(a.root.querySelector("[data-belt-result]")!.textContent).toContain("練習した種目がない");

  const b = await run([], () => {});
  expect(b.root.querySelector<HTMLButtonElement>("[data-start]")!.disabled).toBe(true);
  expect(b.stop).not.toHaveBeenCalled();
});

it("a menu that was never saved earns nothing and says how to start the belt", async () => {
  const { root, mem, stop } = await run(two, (loop) => loop(4500), { saved: false });
  expect(root.querySelector("[data-belt-result]")!.textContent).toBe("メニューを保存すると、帯と強さがたまるよ");
  expect(stop.mock.calls[0][4]).toEqual({ streakLabel: "🔥 1日間 毎日継続中", decor: "frame" });   // streak still counts, no belt
  expect(mem.getItem("karate.menuBelts")).toBeNull();
});

it("the video's 特訓一覧 gets each drill's level and the bar it earned", async () => {
  const menu: Menu = [
    { id: "a", name: "前蹴り", seconds: 2, kind: "drill" },
    { id: "r", name: "休憩", seconds: 2, kind: "rest" },
    { id: "b", name: "回し蹴り", seconds: 2, kind: "drill" },
  ];
  const { stop } = await run(menu, (loop, skip) => { loop(2250); loop(2250); skip(); });
  const [events, , items] = stop.mock.calls[0];
  expect(items).toEqual([
    { name: "前蹴り", seconds: 2, kind: "drill", level: 0, gained: true },
    { name: "休憩", seconds: 2, kind: "rest" },
    { name: "回し蹴り", seconds: 2, kind: "drill", level: 0, gained: false },
  ]);
  // After the last drill every row is marked done, so earned bars show.
  expect(events.at(-1).patch).toEqual({ drillIndex: 3 });
  // Today counts for the 🔥 streak; the saved menu's belt sits next to 特訓一覧.
  expect(stop.mock.calls[0][4]).toEqual({ streakLabel: "🔥 1日間 毎日継続中", beltLabel: "⚪ 白帯", decor: "frame" });
});

it("the row toggle turns a drill into a 休憩 and back", () => {
  const root = document.createElement("div");
  const onChange = vi.fn();
  const menu: Menu = [{ id: "a", name: "新しい種目", seconds: 30, kind: "drill" }, { id: "b", name: "前蹴り", seconds: 30, kind: "drill" }];
  const deps = {
    menu, onChange, onEdit: vi.fn(), onStart: vi.fn(), presets: [],
    onSavePreset: vi.fn(), onLoadPreset: vi.fn(), onDeletePreset: vi.fn(),
    kufuEnabled: true, kufuFor: () => [],
  };
  renderSetupScreen(root, deps);
  root.querySelectorAll<HTMLButtonElement>("[data-kind-toggle]")[0].click();
  const rested = onChange.mock.calls[0][0] as Menu;
  expect(rested[0]).toMatchObject({ kind: "rest", name: "休憩" });   // default name follows the kind
  expect(rested[1]).toEqual(menu[1]);                                 // other rows untouched

  renderSetupScreen(root, { ...deps, menu: rested });
  expect(root.querySelectorAll("[data-kufu-open]")).toHaveLength(1);  // no 💡 on 休憩
  root.querySelectorAll<HTMLButtonElement>("[data-kind-toggle]")[0].click();
  expect((onChange.mock.calls[1][0] as Menu)[0]).toMatchObject({ kind: "drill", name: "新しい種目" });

  // A name the kid typed is kept when switching.
  renderSetupScreen(root, { ...deps, menu: [{ id: "c", name: "ストレッチ", seconds: 30, kind: "drill" }] });
  root.querySelector<HTMLButtonElement>("[data-kind-toggle]")!.click();
  expect((onChange.mock.calls[2][0] as Menu)[0]).toMatchObject({ kind: "rest", name: "ストレッチ" });
});

it("skipping every drill doesn't count toward the 🔥 streak", async () => {
  const { stop } = await run(two, (_loop, skip) => { skip(); skip(); });
  expect(stop.mock.calls[0][4]).toEqual({ beltLabel: "⚪ 白帯", decor: "frame" });
});
