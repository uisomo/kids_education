// @vitest-environment jsdom
import { it, expect, beforeEach } from "vitest";
import { renderStrengthScreen } from "../../karate-trainer/src/ui/strength-screen";
import { recordPractice } from "../../karate-trainer/src/menu-belt-store";
import type { Menu } from "../../karate-trainer/src/types";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const kihon: Menu = [
  { id: "a", name: "前蹴り", seconds: 30, kind: "drill" },
  { id: "r", name: "休憩", seconds: 15, kind: "rest" },
  { id: "b", name: "回し蹴り", seconds: 30, kind: "drill" },
];
const kata: Menu = [{ id: "k", name: "平安初段", seconds: 60, kind: "drill" }];
const menus = [{ id: "p1", name: "基本", menu: kihon }, { id: "p2", name: "型", menu: kata }];

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("asks for a saved menu when there is none", () => {
  const root = document.createElement("div");
  renderStrengthScreen(root, { storage: s, menus: [] });
  expect(root.querySelector("[data-strength-empty]")!.textContent).toContain("メニューを保存");
  expect(root.querySelector("[data-strength-list]")).toBeNull();
});

it("shows the picked menu's drills in order: Lv = practices finished, that many bars, no つうさん line", () => {
  for (let i = 0; i < 3; i++) recordPractice("p1", kihon, ["前蹴り"], s);
  recordPractice("p1", kihon, ["回し蹴り"], s);

  const root = document.createElement("div");
  renderStrengthScreen(root, { storage: s, menus, selectedId: "p1" });

  const rows = root.querySelectorAll("[data-strength-row]");
  expect([...rows].map((r) => r.getAttribute("data-strength-row"))).toEqual(["前蹴り", "回し蹴り"]);
  expect(root.querySelector('[data-strength-level="前蹴り"]')!.textContent).toBe("Lv.3");
  expect(root.querySelector('[data-strength-level="回し蹴り"]')!.textContent).toBe("Lv.1");
  expect(rows[0].querySelectorAll(".strength-bar.lit")).toHaveLength(3);
  expect(rows[0].querySelectorAll(".strength-bar")).toHaveLength(10);
  expect(root.textContent).not.toContain("つうさん");
  // The belt card's bars are the lowest level.
  expect(root.querySelectorAll(".belt-bar.lit")).toHaveLength(1);
});

it("the dropdown switches which menu is shown", () => {
  recordPractice("p2", kata, ["平安初段"], s);
  const root = document.createElement("div");
  renderStrengthScreen(root, { storage: s, menus, selectedId: "p1" });
  const select = root.querySelector<HTMLSelectElement>("[data-strength-menu]")!;
  select.value = "p2";
  select.dispatchEvent(new Event("change"));
  expect(root.querySelector('[data-strength-level="平安初段"]')!.textContent).toBe("Lv.1");
  expect(root.querySelector('[data-strength-row="前蹴り"]')).toBeNull();
});
