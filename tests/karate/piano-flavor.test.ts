// @vitest-environment jsdom
// アランのピアノ (com.alan.piano): the same app built with VITE_APP_FLAVOR=piano.
import { afterEach, it, expect, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(flavor: "karate" | "piano") {
  vi.stubEnv("VITE_APP_FLAVOR", flavor);
  vi.resetModules();
  return {
    flavor: await import("../../karate-trainer/src/flavor"),
    menu: await import("../../karate-trainer/src/menu-store"),
    belts: await import("../../karate-trainer/src/belt-store"),
    training: await import("../../karate-trainer/src/ui/training-screen"),
    presets: await import("../../karate-trainer/src/preset-store"),
    setup: await import("../../karate-trainer/src/ui/setup-screen"),
  };
}

function setupDeps(over: Record<string, unknown> = {}) {
  return {
    menu: [{ id: "d1", name: "ドレミの音階", seconds: 60, kind: "drill" as const }],
    onChange: vi.fn(),
    onEdit: vi.fn(),
    onStart: vi.fn(),
    onOpenVoice: vi.fn(),
    presets: [],
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    ...over,
  };
}

it("piano build: piano words, piano 基本 menu, music notes instead of belts", async () => {
  const { flavor, menu, belts } = await load("piano");
  expect(flavor.IS_PIANO).toBe(true);
  expect(flavor.COPY.appName).toBe("アランのピアノ");
  expect(flavor.COPY.practice).toBe("練習");
  const drills = menu.DEFAULT_MENU.filter((d) => d.kind === "drill").map((d) => d.name);
  expect(drills).toContain("ドレミの音階");
  expect(drills).not.toContain("正拳突き");
  expect(belts.BELTS[0].name).toBe("しろの音符");
  expect(belts.BELTS.at(-1)!.name).toBe("でんせつの音符");
  expect(belts.BELTS.every((b) => !b.name.includes("帯"))).toBe(true);
});

it("karate build is unchanged", async () => {
  const { flavor, menu, belts } = await load("karate");
  expect(flavor.IS_PIANO).toBe(false);
  expect(flavor.COPY.appName).toBe("アランの空手");
  expect(menu.DEFAULT_MENU[0].name).toBe("正拳突き");
  expect(belts.BELTS[0].name).toBe("白帯");
});

it("training screen hides the BGM switch when there is no BGM (the piano app)", async () => {
  const { training } = await load("piano");
  const root = document.createElement("div");
  training.renderTrainingScreen(root, "alan", "none", false);
  expect(root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!.hidden).toBe(true);
  training.renderTrainingScreen(root, "alan", "none", true);
  expect(root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!.hidden).toBe(false);
});

// 休憩 does not exist in the piano app at all — like its missing BGM. It is
// gone from the 基本 menu, from the row controls, and from anything that comes
// back out of storage (an older piano build, or a restored karate backup).
it("piano build: the 基本 menu has no 休憩", async () => {
  const { menu } = await load("piano");
  expect(menu.DEFAULT_MENU.some((d) => d.kind === "rest")).toBe(false);
  expect(menu.DEFAULT_MENU).toHaveLength(5);
  expect(menu.totalSeconds(menu.DEFAULT_MENU)).toBe(300);
});

it("piano build: a stored menu loses its 休憩 rows on the way in", async () => {
  const { menu } = await load("piano");
  const stored: unknown[] = [
    { id: "a", name: "ドレミの音階", seconds: 60, kind: "drill" },
    { id: "b", name: "休憩", seconds: 30, kind: "rest" },
    { id: "c", name: "両手で ひいてみよう", seconds: 60, kind: "drill" },
  ];
  localStorage.setItem("karate.menu", JSON.stringify(stored));
  const loaded = menu.loadMenu();
  expect(loaded.map((d) => d.name)).toEqual(["ドレミの音階", "両手で ひいてみよう"]);
  // …and the 休憩 is gone from storage too, not just from what was returned:
  // the app mirrors localStorage into karate-backup.json, so a row left behind
  // there would come back on the next restore.
  expect(JSON.parse(localStorage.getItem("karate.menu")!)).toHaveLength(2);
  localStorage.clear();
});

it("piano build: a saved menu loses its 休憩 rows too", async () => {
  const { presets } = await load("piano");
  localStorage.setItem("karate.presets", JSON.stringify([{
    id: "p1",
    name: "れんしゅう",
    menu: [
      { id: "a", name: "右手の練習", seconds: 60, kind: "drill" },
      { id: "b", name: "休憩", seconds: 30, kind: "rest" },
    ],
  }]));
  expect(presets.loadPresets()[0].menu.map((d) => d.name)).toEqual(["右手の練習"]);
  expect(JSON.parse(localStorage.getItem("karate.presets")!)[0].menu).toHaveLength(1);
  localStorage.clear();
});

it("karate build: 休憩 is left alone", async () => {
  const { menu } = await load("karate");
  expect(menu.DEFAULT_MENU.some((d) => d.kind === "rest")).toBe(true);
  const withRest = [
    { id: "a", name: "正拳突き", seconds: 30, kind: "rest" as const },
  ];
  expect(menu.withoutRests(withRest)).toHaveLength(1);
});

it("piano build: a row has no ☕休憩 toggle, the karate build does", async () => {
  const piano = await load("piano");
  const pianoRoot = document.createElement("div");
  piano.setup.renderSetupScreen(pianoRoot, setupDeps());
  expect(pianoRoot.querySelectorAll("[data-kind-toggle]")).toHaveLength(0);

  const karate = await load("karate");
  const karateRoot = document.createElement("div");
  karate.setup.renderSetupScreen(karateRoot, setupDeps());
  expect(karateRoot.querySelectorAll("[data-kind-toggle]")).toHaveLength(1);
});
