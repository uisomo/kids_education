// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ScreenRouter } from "../../src/game/screens";

beforeEach(() => {
  document.body.innerHTML = `
    <section class="screen" id="screen-setup"></section>
    <section class="screen" id="screen-subjects"></section>
    <section class="screen" id="screen-units"></section>
    <section class="screen" id="screen-arena"></section>`;
});

describe("ScreenRouter", () => {
  it("shows exactly one screen at a time", () => {
    const r = new ScreenRouter();
    r.show("subjects");
    expect(document.getElementById("screen-subjects")!.classList.contains("active")).toBe(true);
    expect(document.querySelectorAll(".screen.active")).toHaveLength(1);
    r.show("arena");
    expect(r.current).toBe("arena");
    expect(document.getElementById("screen-subjects")!.classList.contains("active")).toBe(false);
  });
});
