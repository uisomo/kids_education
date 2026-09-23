// 🪝 Ready-made hook words. The parent kept typing variations of the same
// question ("which one was best?"), and three identical thumbnails in a row
// look like the same video — so the hook can pick one of these instead.
//
// 「自動」 (HookSetting.auto) draws a fresh one at the start of every practice;
// 「チェンジ」 drops one into the three boxes to edit by hand.
//
// Every line is at most MAX_TEXT_CHARS (6) characters, which is why they say
// 「教えて下さい」 rather than 「教えてください」 (7).
import { COPY } from "./flavor";

// Written for the karate app; the piano build swaps 技 → 曲 and 空手 → ピアノ
// (every line stays inside 6 characters after the swap).
const RAW: string[][] = [
  ["一番の技", "どれですか？", "教えて下さい"],
  ["いい技を", "ひとつだけ", "選んで下さい"],
  ["直すなら", "どこですか？", "教えて下さい"],
  ["僕の課題", "ひとつだけ", "教えて下さい"],
  ["いいところ", "ひとつだけ", "教えて下さい"],
  ["悪いクセ", "見つけたら", "教えて下さい"],
  ["僕の空手", "何点ですか？", "教えて下さい"],
  ["先生なら", "どこ直す？", "教えて下さい"],
  ["この中で", "どれが好き？", "教えて下さい"],
  ["一番いいの", "どれですか？", "選んで下さい"],
  ["足りないもの", "ひとつだけ", "教えて下さい"],
  ["気づいたこと", "ひとつだけ", "教えて下さい"],
  // 「どの技ですか？」 is 7 characters, so the question mark goes.
  ["次やるなら", "どの技ですか", "選んで下さい"],
  ["伸ばすなら", "どの技ですか", "教えて下さい"],
  ["惜しい技", "どれですか？", "教えて下さい"],
  ["もう一度", "見たい技を", "教えて下さい"],
  ["僕にひとつ", "アドバイス", "ください"],
  ["この中から", "ベストな技", "選んで下さい"],
  ["どこ直す？", "どこ伸ばす？", "教えて下さい"],
  ["あなたなら", "何を直す？", "教えて下さい"],
];

export const HOOK_PRESETS: string[][] = RAW.map((lines) =>
  lines.map((line) => line.replace(/技/g, COPY.skill).replace(/空手/g, COPY.artName)),
);

// One preset as the three-line text the hook store holds.
export function presetText(index: number): string {
  return (HOOK_PRESETS[((index % HOOK_PRESETS.length) + HOOK_PRESETS.length) % HOOK_PRESETS.length] ?? []).join("\n");
}

// A preset other than `avoid` — so 「チェンジ」 always visibly changes something
// and 「自動」 never opens two practices in a row with the same words.
export function nextPresetIndex(avoid: number | null, random: () => number = Math.random): number {
  const n = HOOK_PRESETS.length;
  if (avoid === null || !(avoid >= 0 && avoid < n)) return Math.floor(random() * n) % n;
  return (avoid + 1 + Math.floor(random() * (n - 1))) % n;
}
