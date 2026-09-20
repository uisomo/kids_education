import { it, expect, beforeEach } from "vitest";
import {
  loadLetters,
  addLetter,
  markLetterRead,
  removeLetter,
  unreadLetters,
  LETTER_MAX_LEN,
  LETTER_BY_MAX_LEN,
  LETTER_KEEP,
} from "../../karate-trainer/src/letter-store";
import { saveComment } from "../../karate-trainer/src/comment-store";

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

it("starts empty", () => {
  expect(loadLetters(s)).toEqual([]);
});

it("keeps every letter instead of overwriting the last one", () => {
  addLetter("きのうも えらかった", "パパ", s);
  addLetter("きょうも がんばろう", "ママ", s);
  const letters = loadLetters(s);
  expect(letters).toHaveLength(2);
  // Newest first.
  expect(letters[0].text).toBe("きょうも がんばろう");
  expect(letters[0].by).toBe("ママ");
  expect(letters[1].text).toBe("きのうも えらかった");
});

it("arrives unread and is read once", () => {
  addLetter("がんばれ", "パパ", s);
  const [letter] = loadLetters(s);
  expect(letter.readAt).toBeUndefined();
  expect(unreadLetters(loadLetters(s))).toHaveLength(1);

  markLetterRead(letter.id, s);
  const readAt = loadLetters(s)[0].readAt;
  expect(readAt).toBeDefined();
  expect(unreadLetters(loadLetters(s))).toHaveLength(0);

  // Reading again keeps the first time it was seen.
  markLetterRead(letter.id, s);
  expect(loadLetters(s)[0].readAt).toBe(readAt);
});

it("keeps only the newest few letters", () => {
  for (let i = 0; i < LETTER_KEEP + 3; i++) addLetter(`てがみ${i}`, "パパ", s);
  const letters = loadLetters(s);
  expect(letters).toHaveLength(LETTER_KEEP);
  expect(letters[0].text).toBe(`てがみ${LETTER_KEEP + 2}`);
  expect(letters.some((l) => l.text === "てがみ0")).toBe(false);
});

it("trims and caps the text and the signature, and ignores a blank letter", () => {
  addLetter(`  ${"あ".repeat(LETTER_MAX_LEN + 20)}  `, `  ${"い".repeat(LETTER_BY_MAX_LEN + 5)}  `, s);
  const [letter] = loadLetters(s);
  expect(letter.text).toBe("あ".repeat(LETTER_MAX_LEN));
  expect(letter.by).toBe("い".repeat(LETTER_BY_MAX_LEN));

  addLetter("   ", "パパ", s);
  expect(loadLetters(s)).toHaveLength(1);
});

it("けす removes one letter", () => {
  addLetter("ひとつめ", "パパ", s);
  addLetter("ふたつめ", "パパ", s);
  const target = loadLetters(s)[1].id;
  removeLetter(target, s);
  expect(loadLetters(s).map((l) => l.text)).toEqual(["ふたつめ"]);
});

it("carries an existing 感想コメント over as the first letter, once", () => {
  saveComment("kansou", "いつも がんばってるね", s);
  saveComment("kansouBy", "おかあさん", s);
  const [letter] = loadLetters(s);
  expect(letter.text).toBe("いつも がんばってるね");
  expect(letter.by).toBe("おかあさん");
  expect(letter.readAt).toBeUndefined();

  // The migration is written back: reading it sticks, and it is not re-seeded.
  markLetterRead(letter.id, s);
  expect(loadLetters(s)).toHaveLength(1);
  expect(loadLetters(s)[0].readAt).toBeDefined();
});

it("a member with no 感想コメント starts with no letters", () => {
  expect(loadLetters(s)).toEqual([]);
  addLetter("はじめまして", "パパ", s);
  expect(loadLetters(s)).toHaveLength(1);
});

it("survives corrupt storage", () => {
  s.setItem("karate.letters", "{{{");
  expect(loadLetters(s)).toEqual([]);
  s.setItem("karate.letters", JSON.stringify([{ nope: 1 }, { id: "a", text: "t", by: "", createdAt: 5 }]));
  expect(loadLetters(s).map((l) => l.id)).toEqual(["a"]);
});
