// 🪝 How the hook words are painted. Every practice picks one of these on its
// own, because three videos in a row in the same white-and-red opened with the
// same-looking thumbnail — the colour is what tells them apart at a glance.
//
// The look stays the YouTube one throughout: a bright fill, a thick black
// outline around it and a solid drop underneath, so the words read over any
// background the camera happens to see. Only the colours move.
//
// ⚠️ OverlayCompositor.swift (hookPalettes / hookLineLayer) mirrors this table
// — the burned video has to match what the child saw, so the two lists must be
// edited together.

export interface HookPalette {
  // Shown nowhere; a name to talk about them by.
  name: string;
  // One per line (or, in "char" mode, cycled character by character).
  fills: [string, string, string];
  // The solid drop under the letters.
  drop: string;
}

export const HOOK_PALETTES: HookPalette[] = [
  { name: "しろ×あか",   fills: ["#ffffff", "#ffe14d", "#ffffff"], drop: "#e5243b" },
  { name: "ビタミン",     fills: ["#ffe14d", "#ff8f1f", "#ffffff"], drop: "#7a2a00" },
  { name: "ソーダ",       fills: ["#7ef9ff", "#ffffff", "#4de1ff"], drop: "#0b3d91" },
  { name: "ライム",       fills: ["#c8ff2e", "#ffffff", "#c8ff2e"], drop: "#1b6b2a" },
  { name: "マゼンタ",     fills: ["#ff5fa2", "#ffffff", "#ffd6e8"], drop: "#7a0f3d" },
  { name: "ファイア",     fills: ["#ffffff", "#ff4757", "#ffd166"], drop: "#1b1b1b" },
  { name: "ミント",       fills: ["#b9ffd8", "#ffffff", "#35e08b"], drop: "#0f5132" },
  { name: "グレープ",     fills: ["#d6a6ff", "#ffffff", "#b388ff"], drop: "#3b0d6b" },
];

// "line": one colour per line (the whole line lands in it).
// "char": the palette cycles character by character inside each line.
export type HookColorMode = "line" | "char";

// The mode every practice uses. Kept as one constant rather than a setting:
// the family picked a look, and one more switch on the start screen is one
// more thing to explain.
export const HOOK_COLOR_MODE: HookColorMode = "line";

export function hookPalette(index: number): HookPalette {
  const n = HOOK_PALETTES.length;
  return HOOK_PALETTES[((index % n) + n) % n];
}

// A palette other than `avoid`, so two practices in a row never look alike.
export function nextHookPalette(avoid: number | null, random: () => number = Math.random): number {
  const n = HOOK_PALETTES.length;
  if (avoid === null || !(avoid >= 0 && avoid < n)) return Math.floor(random() * n) % n;
  return (avoid + 1 + Math.floor(random() * (n - 1))) % n;
}

// The fill for one character: by line in "line" mode, by position in "char"
// mode (counted across the whole line, so 「一番の技」 runs through the palette).
export function hookFill(
  palette: HookPalette, mode: HookColorMode, row: number, charIndex: number,
): string {
  const fills = palette.fills;
  return mode === "char"
    ? fills[(charIndex + row) % fills.length]
    : fills[row % fills.length];
}
