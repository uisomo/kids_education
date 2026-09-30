// @vitest-environment jsdom
// SERIES_GUIDE 5.6: the read-aloud 🪝 hook must have a つづき button — time alone
// must never be the only way on.
import { it, expect } from "vitest";
import { renderTrainingScreen } from "../../karate-trainer/src/ui/training-screen";

it("shows つづき only while the hook is up, and tapping it calls the skip handlers", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const view = renderTrainingScreen(root);
  const btn = root.querySelector<HTMLButtonElement>("[data-hook-skip]")!;
  expect(btn).not.toBeNull();
  expect(btn.hidden).toBe(true);

  let skipped = 0;
  view.onHookSkip(() => skipped++);
  view.setTexts([["いち", "に"]]);
  expect(btn.hidden).toBe(false);
  expect(btn.textContent).toContain("つづき");
  btn.click();
  expect(skipped).toBe(1);

  view.setTexts(null);
  expect(btn.hidden).toBe(true);
});


it("shows all three recording lines while the reading cue advances independently", () => {
  const root = document.createElement("div");
  const view = renderTrainingScreen(root);
  view.setTexts([["この技"], ["どうですか"], ["見てね"]], 0, true);
  const words = [...root.querySelectorAll<HTMLElement>(".text-grid-word")];
  expect(words).toHaveLength(3);
  expect(words.every(word => word.classList.contains("show"))).toBe(true);
  view.revealText(0);
  expect(words[0].style.textDecoration).toContain("underline");
  view.revealText(1);
  expect(words[0].style.textDecoration).toBe("none");
  expect(words[1].style.textDecoration).toContain("underline");
  expect(words.every(word => word.classList.contains("show"))).toBe(true);
  view.setTexts(null);
  expect(root.querySelector(".text-grid-word")).toBeNull();
});
