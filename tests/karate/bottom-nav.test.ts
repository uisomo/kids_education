// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { createBottomNav } from "../../karate-trainer/src/ui/bottom-nav";

it("renders 3 tabs and marks the active one", () => {
  const nav = createBottomNav({ active: "strength", onSelect: vi.fn() });
  const tabs = nav.querySelectorAll("[data-navtab]");
  expect(tabs).toHaveLength(3);
  expect(nav.querySelector(".bottom-nav-btn.active")!.getAttribute("data-navtab")).toBe("strength");
});

it("fires onSelect with the tapped tab id", () => {
  const onSelect = vi.fn();
  const nav = createBottomNav({ active: "train", onSelect });
  nav.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  expect(onSelect).toHaveBeenCalledWith("family");
});
