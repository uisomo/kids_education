// @vitest-environment jsdom
// tests/karate/done-screen.test.ts
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";

it("shows stats and fires download", () => {
  const root = document.createElement("div");
  const onDownload = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onDownload, onAgain: vi.fn(),
  });
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:v");
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl.textContent).toContain("mp4");
  dl.click();
  expect(onDownload).toHaveBeenCalledOnce();
});
