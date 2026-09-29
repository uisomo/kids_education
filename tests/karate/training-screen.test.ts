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

it("× asks 「やめる？」 once: つづける goes back, やめる fires the stop handler", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  const onAsk = vi.fn(), onCancel = vi.fn(), onStop = vi.fn();
  view.onStopAsk(onAsk);
  view.onStopCancel(onCancel);
  view.onStop(onStop);
  // No pause / skip / bottom 終了 on the karate screen (SERIES_GUIDE 5.15).
  expect(root.querySelector("[data-pause]")).toBeNull();
  expect(root.querySelector("[data-skip]")).toBeNull();
  expect(root.querySelector("[data-piece-done]")).toBeNull();
  expect(root.querySelector("[data-stop]")).toBeNull();

  const close = root.querySelector<HTMLButtonElement>("[data-training-close]")!;
  expect(close.classList.contains("a-iconbtn")).toBe(true);
  expect(close.parentElement!.firstElementChild).toBe(close);   // top-left of the bar
  close.click();
  expect(onAsk).toHaveBeenCalledOnce();
  expect(root.querySelector("[data-stop-sheet]")!.textContent).toContain("やめる？");
  close.click();   // already asking: no second sheet
  expect(root.querySelectorAll("[data-stop-sheet]")).toHaveLength(1);

  root.querySelector<HTMLButtonElement>("[data-stop-cancel]")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(root.querySelector("[data-stop-sheet]")).toBeNull();
  expect(onStop).not.toHaveBeenCalled();

  close.click();
  root.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  expect(onStop).toHaveBeenCalledOnce();
  expect(root.querySelector("[data-stop-sheet]")).toBeNull();
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
  const view = renderTrainingScreen(root, "alan", "none", true, false, "ja");
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

it("in English a cue plays an English clip and names the character in English", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root, "alan", "none", true, false, "en");
  const played = view.showCue("");
  const vid = root.querySelector<HTMLVideoElement>(".companion-cheer-video")!;
  expect(vid.getAttribute("src")).toMatch(/^\/characters\/cheer\/en\/(alan|leo|izzy)-\d+\.mov$/);
  expect(played?.audio).toBe(played?.src.replace(/\.mov$/, ".m4a"));
  const owner = Object.values(CHARACTERS).find((c) => c.cheerClipsEn.some((k) => k.src === played?.src))!;
  expect(root.querySelector("[data-speech]")!.textContent).toBe(`${owner.nameEn}: ${played?.text}`);
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

it("keeps the menu name off the recording screen (it goes in the video's 特訓一覧)", () => {
  const root = document.createElement("div");
  renderTrainingScreen(root, "alan", "frame");
  expect(root.querySelector("[data-menu-name]")).toBeNull();
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
