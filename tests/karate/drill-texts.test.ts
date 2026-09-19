import { it, expect, describe } from "vitest";
import { parseDrillTexts, textCount, revealedGrid, drillTextGrid } from "../../karate-trainer/src/drill-texts";

describe("parseDrillTexts", () => {
  it("splits lines on newlines and words on whitespace", () => {
    expect(parseDrillTexts("いち に さん\nし ご")).toEqual([["いち", "に", "さん"], ["し", "ご"]]);
  });

  it("drops blank words and blank lines entirely", () => {
    expect(parseDrillTexts("  いち   に  \n\n   \nさん")).toEqual([["いち", "に"], ["さん"]]);
  });

  it("caps at 5 words per line and 3 lines", () => {
    const raw = "a b c d e f g\n1 2\n3 4\n5 6";
    expect(parseDrillTexts(raw)).toEqual([["a", "b", "c", "d", "e"], ["1", "2"], ["3", "4"]]);
  });

  it("returns [] for undefined or whitespace-only input", () => {
    expect(parseDrillTexts(undefined)).toEqual([]);
    expect(parseDrillTexts("   \n  ")).toEqual([]);
  });
});

it("textCount sums words across lines", () => {
  expect(textCount([["a", "b"], ["c"]])).toBe(3);
  expect(textCount([])).toBe(0);
});

describe("revealedGrid", () => {
  const grid = [["a", "b", "c"], ["d", "e"]];

  it("slices in reading order, keeping line positions", () => {
    expect(revealedGrid(grid, 0)).toEqual([]);
    expect(revealedGrid(grid, 2)).toEqual([["a", "b"]]);
    expect(revealedGrid(grid, 4)).toEqual([["a", "b", "c"], ["d"]]);
    expect(revealedGrid(grid, 5)).toEqual(grid);
  });
});

describe("drillTextGrid", () => {
  it("returns the grid only for TEXT-mode drills", () => {
    const base = { id: "x", name: "型", seconds: 30, kind: "drill" as const };
    expect(drillTextGrid({ ...base, timerMode: "text", texts: "いち に" })).toEqual([["いち", "に"]]);
    expect(drillTextGrid({ ...base, texts: "いち に" })).toEqual([]);          // default = countdown
    expect(drillTextGrid({ ...base, timerMode: "text" })).toEqual([]);         // no texts entered
  });
});
