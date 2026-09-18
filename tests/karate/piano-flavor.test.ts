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
  };
}

it("piano build: piano words, piano 基本 menu, ribbons instead of belts", async () => {
  const { flavor, menu, belts } = await load("piano");
  expect(flavor.IS_PIANO).toBe(true);
  expect(flavor.COPY.appName).toBe("アランのピアノ");
  expect(flavor.COPY.practice).toBe("練習");
  const drills = menu.DEFAULT_MENU.filter((d) => d.kind === "drill").map((d) => d.name);
  expect(drills).toContain("ドレミの音階");
  expect(drills).not.toContain("正拳突き");
  expect(belts.BELTS[0].name).toBe("白リボン");
  expect(belts.BELTS.at(-1)!.name).toBe("でんせつのリボン");
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
