import { it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { appLang } from "../../karate-trainer/src/i18n";
import { CHARACTERS, cheerClipsFor, characterName } from "../../karate-trainer/src/character-store";

it("is Japanese when the first preferred language is Japanese, English otherwise", () => {
  expect(appLang({ languages: ["ja-JP", "en-US"] })).toBe("ja");
  expect(appLang({ languages: ["ja"] })).toBe("ja");
  expect(appLang({ languages: ["en-US", "ja-JP"] })).toBe("en");
  expect(appLang({ languages: ["fr-FR"] })).toBe("en");
  expect(appLang({ language: "ja-JP" })).toBe("ja");
});

it("falls back to Japanese when the language is unknown", () => {
  expect(appLang({})).toBe("ja");
});

it("keeps the Japanese voices in Japanese and uses the English recordings in English", () => {
  for (const c of Object.values(CHARACTERS)) {
    expect(cheerClipsFor(c, "ja")).toBe(c.cheerClips);
    expect(cheerClipsFor(c, "en")).toBe(c.cheerClipsEn);
    expect(characterName(c, "ja")).toBe(c.name);
    expect(characterName(c, "en")).toBe(c.nameEn);
  }
});

it("every cheer clip's animation and voice file ship with the app", () => {
  const pub = resolve(__dirname, "../../karate-trainer/public");
  const clips = Object.values(CHARACTERS).flatMap((c) => [...c.cheerClips, ...c.cheerClipsEn]);
  expect(clips.length).toBe(18 + 24);
  for (const clip of clips) {
    expect(existsSync(pub + clip.src), clip.src).toBe(true);
    expect(existsSync(pub + clip.audio), clip.audio).toBe(true);
  }
});
