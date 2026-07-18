// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Hud } from "../../src/game/hud";

describe("Hud", () => {
  it("renders HP bar width proportionally", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.setHp(50, 100);
    const fill = root.querySelector<HTMLElement>(".hp-fill")!;
    expect(fill.style.width).toBe("50%");
  });
  it("journal accumulates entries; no earning meter exists", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.journalAdd("りゆうをつけて言えた");
    hud.journalAdd("しつもんできた");
    expect(root.querySelectorAll(".journal li")).toHaveLength(2);
    expect(root.querySelector(".coins, .money, .earnings")).toBeNull();
  });
  it("subtitle updates live", () => {
    const root = document.createElement("div");
    const hud = new Hud(root);
    hud.setSubtitle("やすく…");
    expect(root.querySelector(".subtitle")!.textContent).toBe("やすく…");
  });
});
