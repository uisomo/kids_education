// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { createBottomNav } from "../../karate-trainer/src/ui/bottom-nav";

it("renders 4 tabs and marks the active one", () => {
  const nav = createBottomNav({ active: "strength", onSelect: vi.fn() });
  const tabs = nav.querySelectorAll("[data-navtab]");
  expect(tabs).toHaveLength(4);
  expect(nav.querySelector(".bottom-nav-btn.active")!.getAttribute("data-navtab")).toBe("strength");
});

it("fires onSelect with the tapped tab id", () => {
  const onSelect = vi.fn();
  const nav = createBottomNav({ active: "train", onSelect });
  nav.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
  expect(onSelect).toHaveBeenCalledWith("family");
});

it("has the 🎒アイテム tab between 特訓 and 積み重ね", () => {
  const nav = createBottomNav({ active: "train", onSelect: vi.fn() });
  const ids = [...nav.querySelectorAll("[data-navtab]")].map((b) => b.getAttribute("data-navtab"));
  expect(ids).toEqual(["train", "sparkle", "strength", "family"]);
  // 中身は キラキラ だけではない（帯・ブロックも入る）ので、名前は「アイテム」。
  expect(nav.querySelector('[data-navtab="sparkle"]')!.textContent).toContain("アイテム");
});
