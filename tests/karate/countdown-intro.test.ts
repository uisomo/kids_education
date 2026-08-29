// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { playCountdownIntro } from "../../karate-trainer/src/ui/countdown-intro";

it("fires each beat in order and resolves after Go!! (stepMs=0)", async () => {
  const root = document.createElement("div");
  const beats: string[] = [];
  await playCountdownIntro(root, { stepMs: 0, onBeat: (c) => beats.push(c) });
  expect(beats).toEqual(["Ready", "3", "2", "1", "Go!!"]);
  // overlay is cleaned up once the intro resolves
  expect(root.querySelector("[data-intro]")).toBeNull();
});

it("shows the overlay while running and marks Go!! specially", async () => {
  const root = document.createElement("div");
  const seenLabels: string[] = [];
  await playCountdownIntro(root, {
    stepMs: 0,
    onBeat: () => {
      const label = root.querySelector<HTMLElement>("[data-intro-label]");
      if (label) seenLabels.push(label.textContent ?? "");
    },
  });
  expect(seenLabels).toContain("Go!!");
});
