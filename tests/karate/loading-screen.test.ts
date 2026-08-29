// @vitest-environment jsdom
import { it, expect } from "vitest";
import { renderLoadingScreen } from "../../karate-trainer/src/ui/loading-screen";

it("renders a spinner and a message", () => {
  const root = document.createElement("div");
  renderLoadingScreen(root);
  expect(root.className).toContain("loading");
  expect(root.querySelector(".loading-spinner")).not.toBeNull();
  expect(root.querySelector("[data-loading-message]")!.textContent).toBeTruthy();
});
