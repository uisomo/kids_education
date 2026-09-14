// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderTrainingScreen } from "../../karate-trainer/src/ui/training-screen";
import { CHARACTERS } from "../../karate-trainer/src/character-store";

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
  const played = view.showCue("ファイト！");
  const overlay = root.querySelector<HTMLElement>("[data-companion]")!;
  expect(overlay.classList.contains("cheering")).toBe(true);
  const vid = root.querySelector<HTMLVideoElement>(".companion-cheer-video")!;
  expect(vid.getAttribute("src")).toMatch(/^\/characters\/cheer\/(alan|leo|izzy)-\d+\.mov$/);
  // Voice is played separately (native engine); the animation stays muted.
  expect(vid.muted).toBe(true);
  expect(played?.src).toBe(vid.getAttribute("src"));
  expect(played?.audio).toBe(played?.src.replace(/\.mov$/, ".m4a"));
  const clip = Object.values(CHARACTERS).flatMap((c) => c.cheerClips).find((c) => c.src === played?.src)!;
  expect(root.querySelector("[data-speech]")!.textContent).toContain(clip.text);
  expect(vid.loop).toBe(false);
  expect(root.querySelector("[data-speech]")!.textContent).toContain(":");
});
