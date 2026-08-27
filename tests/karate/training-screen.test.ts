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
