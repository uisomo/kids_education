// @vitest-environment jsdom
// tests/karate/done-screen.test.ts
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";

it("shows stats and a save button", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:v");
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl.textContent).toContain("mp4");
});

it("save opens a parental gate; passing it fires onShare", () => {
  const root = document.createElement("div");
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    gateChallenge: { a: 2, b: 2, answer: 4 },
  });

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  // gate is now shown, share not yet called
  expect(root.querySelector("[data-gate-submit]")).not.toBeNull();
  expect(onShare).not.toHaveBeenCalled();

  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  input.value = "4";
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
  expect(onShare).toHaveBeenCalledOnce();
});

it("cancelling the gate returns to the done screen", () => {
  const root = document.createElement("div");
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    gateChallenge: { a: 2, b: 2, answer: 4 },
  });
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  // back on done screen (save button present again), share never called
  expect(root.querySelector("[data-download]")).not.toBeNull();
  expect(onShare).not.toHaveBeenCalled();
});
