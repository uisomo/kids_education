// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderTrainingScreen } from "../../karate-trainer/src/ui/training-screen";

it("mirrors the video and updates the timer", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  expect(view.videoEl.hasAttribute("playsinline")).toBe(true);
  expect(view.videoEl.muted).toBe(true);
  expect(view.videoEl.classList.contains("mirror")).toBe(true);
  view.setTime(18);
  expect(root.querySelector("[data-timer]")!.textContent).toContain("18");
});

it("fires stop handler", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const onStop = vi.fn();
  view.onStop(onStop);
  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  expect(onStop).toHaveBeenCalledOnce();
});

it("renders a BGM toggle button that starts unmuted and fires onToggleBgm", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const btn = root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!;
  expect(btn).not.toBeNull();
  expect(btn.textContent).toBe("🎵");
  const onToggleBgm = vi.fn();
  view.onToggleBgm(onToggleBgm);
  btn.click();
  expect(onToggleBgm).toHaveBeenCalledOnce();
});

it("setBgmMuted flips the button's icon and muted state", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const btn = root.querySelector<HTMLButtonElement>("[data-bgm-toggle]")!;
  view.setBgmMuted(true);
  expect(btn.textContent).toBe("🔇");
  expect(btn.classList.contains("is-muted")).toBe(true);
  view.setBgmMuted(false);
  expect(btn.textContent).toBe("🎵");
  expect(btn.classList.contains("is-muted")).toBe(false);
});

it("renders the Dojo backdrop and a hidden companion cheer video", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root);
  expect(root.querySelector(".training-dojo-bg")).not.toBeNull();
  const overlay = root.querySelector<HTMLElement>("[data-companion]")!;
  expect(overlay).not.toBeNull();
  // not cheering until a cue arrives
  expect(overlay.classList.contains("cheering")).toBe(false);
  expect(root.querySelector<HTMLVideoElement>(".companion-cheer-video")).not.toBeNull();
});

it("a cue reveals a companion cheer clip with a quote", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  view.showCue("ファイト！");
  const overlay = root.querySelector<HTMLElement>("[data-companion]")!;
  expect(overlay.classList.contains("cheering")).toBe(true);
  const vid = root.querySelector<HTMLVideoElement>(".companion-cheer-video")!;
  expect(vid.getAttribute("src")).toMatch(/_cheer\.webm$/);
  expect(root.querySelector("[data-speech]")!.textContent).toContain(":");
});
