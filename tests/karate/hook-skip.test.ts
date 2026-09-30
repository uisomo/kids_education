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
