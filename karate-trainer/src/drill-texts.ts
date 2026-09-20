// 🪝 read-aloud hook helpers: parse the three line boxes into the lines shown
// before Ready → Go!!, and slice them by how many have been revealed.

export const MAX_TEXT_LINES = 3;
// Each line is its own box in the start row, up to 6 characters.
export const MAX_TEXT_CHARS = 6;

// The first 6 characters (emoji count as one, not as two UTF-16 units).
export function clampChars(text: string): string {
  return Array.from(text).slice(0, MAX_TEXT_CHARS).join("");
}

// One entry per typed line — each line lands as a whole, with one ドン. Runs
// of spaces collapse to one, blank lines vanish (no slot, no sound), and
// anything past 6 characters or 3 lines is dropped. (Kept as string[][] so
// the overlay log and burn-in read the same shape as before.)
export function parseDrillTexts(raw: string | undefined): string[][] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => clampChars(line.trim().replace(/\s+/g, " ")).trim())
    .filter(Boolean)
    .slice(0, MAX_TEXT_LINES)
    .map((line) => [line]);
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
