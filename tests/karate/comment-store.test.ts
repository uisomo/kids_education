import { it, expect, beforeEach } from "vitest";
import {
  loadComments,
  saveComment,
  COMMENT_MAX_LEN,
  type Comments,
} from "../../karate-trainer/src/comment-store";

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

it("defaults to empty strings when nothing saved", () => {
  expect(loadComments(s)).toEqual<Comments>({ kansou: "", fight: "" });
});

it("saves and reloads a 感想 comment", () => {
  saveComment("kansou", "いつも がんばってるね", s);
  expect(loadComments(s).kansou).toBe("いつも がんばってるね");
  expect(loadComments(s).fight).toBe("");   // other key untouched
});

it("saves and reloads a ファイト comment independently", () => {
  saveComment("fight", "あと ちょっと！", s);
  expect(loadComments(s).fight).toBe("あと ちょっと！");
  expect(loadComments(s).kansou).toBe("");
});

it("overwrites on the next save (single value each)", () => {
  saveComment("kansou", "むかしのコメント", s);
  saveComment("kansou", "あたらしいコメント", s);
  expect(loadComments(s).kansou).toBe("あたらしいコメント");
});

it("trims surrounding whitespace and caps length", () => {
  const long = "あ".repeat(50);
  saveComment("fight", `   ${long}   `, s);
  expect(loadComments(s).fight).toHaveLength(COMMENT_MAX_LEN);
});

it("clears a comment when saving empty / whitespace-only text", () => {
  saveComment("kansou", "なにか", s);
  saveComment("kansou", "   ", s);
  expect(loadComments(s).kansou).toBe("");
});

it("survives corrupt stored JSON by returning defaults", () => {
  s.setItem("karate.comments", "{not json");
  expect(loadComments(s)).toEqual<Comments>({ kansou: "", fight: "" });
});
