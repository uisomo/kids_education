import { it, expect, describe } from "vitest";
import { parseDrillTexts, textCount, revealedGrid, clampChars } from "../../karate-trainer/src/drill-texts";

describe("parseDrillTexts", () => {
  it("makes one entry per line, spaces kept inside it", () => {
    expect(parseDrillTexts("いち に\nしごろく")).toEqual([["いち に"], ["しごろく"]]);
  });

  it("collapses runs of spaces and drops blank lines entirely", () => {
    expect(parseDrillTexts("  いち   に  \n\n   \nさん")).toEqual([["いち に"], ["さん"]]);
  });

  it("caps at 6 characters per line and 3 lines", () => {
    const raw = "a b c d e f g\nおすおすおすおす\n3 4\n5 6";
    expect(parseDrillTexts(raw)).toEqual([["a b c"], ["おすおすおす"], ["3 4"]]);
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

it("clampChars keeps 6 characters, counting an emoji as one", () => {
  expect(clampChars("がんばるぞーっ")).toBe("がんばるぞー");
  expect(clampChars("🥋🥋🥋🥋🥋🥋🥋")).toBe("🥋🥋🥋🥋🥋🥋");
  expect(clampChars("おす")).toBe("おす");
});
