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

it("does not show the アランのからて badge while practicing (it is only burned into the saved video)", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root);
  expect(root.querySelector("[data-alan-badge]")).toBeNull();
});

it("shows the かざり over the camera, at the same place the export burns it", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root, "alan", "icon");
  const decor = root.querySelector<HTMLImageElement>("[data-decor-preview]")!;
  expect(decor.dataset.decorPreview).toBe("icon");
  expect(decor.className).toContain("training-decor-icon");
  expect(decor.getAttribute("src")).toBe("/images/decor-icon.png");
  expect(decor.getAttribute("aria-hidden")).toBe("true");
});

it("draws no かざり preview when the household turned it off", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root, "alan", "none");
  expect(root.querySelector("[data-decor-preview]")).toBeNull();
});

it("names the saved menu being practiced in the top bar", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root, "alan", "none", "強くなるため");
  const name = root.querySelector<HTMLElement>("[data-menu-name]")!;
  expect(name.textContent).toBe("強くなるため");
  expect(name.hidden).toBe(false);
});

it("hides the menu name for a menu that was never saved", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root, "alan", "none", "");
  expect(root.querySelector<HTMLElement>("[data-menu-name]")!.hidden).toBe(true);
});

it("labels the next drill and hides the pill when there is none", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const next = root.querySelector<HTMLElement>("[data-next]")!;
  expect(next.hidden).toBe(true);
  view.setNext("前蹴り");
  expect(next.hidden).toBe(false);
  expect(next.textContent).toBe("Next前蹴り");
  expect(root.querySelector("[data-next-name]")!.textContent).toBe("前蹴り");
  view.setNext(null);
  expect(next.hidden).toBe(true);
});

it("shows no 種目 counter for a menu with nothing but 休憩", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  view.setDrill({ id: "r", name: "休憩", seconds: 30, kind: "rest" }, 0, 0);
  expect(root.querySelector("[data-prog]")!.textContent).toBe("");
});
