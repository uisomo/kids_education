// TEXT-mode helpers: parse a drill's raw texts field into the word grid shown
// during training, and slice it by how many words have been revealed so far.
import type { Drill } from "./types";

export const MAX_TEXTS_PER_LINE = 5;
export const MAX_TEXT_LINES = 3;

// Lines of words, in the layout they were typed: newlines separate lines,
// whitespace separates words. Blank words/lines vanish entirely (no slot, no
// sound), and anything beyond 5 words per line or 3 lines is dropped.
export function parseDrillTexts(raw: string | undefined): string[][] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TEXTS_PER_LINE))
    .filter((words) => words.length > 0)
    .slice(0, MAX_TEXT_LINES);
}

export function textCount(grid: string[][]): number {
  return grid.reduce((sum, line) => sum + line.length, 0);
}

// The grid's first `count` words in reading order (top line first, left to
// right), keeping their line positions — what the burn-in overlay shows.
export function revealedGrid(grid: string[][], count: number): string[][] {
  const out: string[][] = [];
  let left = count;
  for (const line of grid) {
    if (left <= 0) break;
    out.push(line.slice(0, left));
    left -= line.length;
  }
  return out;
}

// Does this drill use TEXT mode with at least one word to show?
export function drillTextGrid(drill: Drill): string[][] {
  if (drill.timerMode !== "text") return [];
  return parseDrillTexts(drill.texts);
}
