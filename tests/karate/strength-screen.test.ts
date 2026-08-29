// @vitest-environment jsdom
import { it, expect, beforeEach } from "vitest";
import { renderStrengthScreen } from "../../karate-trainer/src/ui/strength-screen";
import { bumpDrills } from "../../karate-trainer/src/progress-store";

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

let s: Storage;
beforeEach(() => { s = memStorage(); });

it("shows an empty message when nothing practiced", () => {
  const root = document.createElement("div");
  renderStrengthScreen(root, { storage: s });
  expect(root.querySelector("[data-strength-empty]")).not.toBeNull();
  expect(root.querySelector("[data-strength-list]")).toBeNull();
});

it("renders a row per practiced drill, most-practiced first, with level + lit bars", () => {
  // 前蹴り practiced 13 times → Lv.1, 3 bars lit. 回し蹴り 5 times → Lv.0, 5 bars lit.
  for (let i = 0; i < 13; i++) bumpDrills(["前蹴り"], s);
  for (let i = 0; i < 5; i++) bumpDrills(["回し蹴り"], s);

  const root = document.createElement("div");
  renderStrengthScreen(root, { storage: s });

  const rows = root.querySelectorAll("[data-strength-row]");
  expect(rows).toHaveLength(2);
  // most-practiced first
  expect(rows[0].getAttribute("data-strength-row")).toBe("前蹴り");

  expect(root.querySelector('[data-strength-level="前蹴り"]')!.textContent).toBe("Lv.1");
  expect(root.querySelector('[data-strength-level="回し蹴り"]')!.textContent).toBe("Lv.0");

  const litFront = rows[0].querySelectorAll(".strength-bar.lit").length;
  const litRoundhouse = rows[1].querySelectorAll(".strength-bar.lit").length;
  expect(litFront).toBe(3);
  expect(litRoundhouse).toBe(5);
  // always 10 bars total
  expect(rows[0].querySelectorAll(".strength-bar")).toHaveLength(10);
});
