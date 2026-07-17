import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProfile, saveProfile, appendTranscript, recordLessonSummary } from "../../src/backend/services/profile-store";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tq-")); });

describe("profile-store", () => {
  it("creates default profile on first read", () => {
    const p = getProfile(dir, "yuta");
    expect(p.name).toBe("yuta");
    expect(p.recentLessons).toEqual([]);
  });
  it("round-trips saves", () => {
    const p = getProfile(dir, "yuta");
    p.interests.push("サッカー");
    saveProfile(dir, p);
    expect(getProfile(dir, "yuta").interests).toEqual(["サッカー"]);
  });
  it("appends transcript lines as jsonl", () => {
    appendTranscript(dir, "yuta", { kind: "kid", text: "こんにちは" });
    appendTranscript(dir, "yuta", { kind: "enemy", text: "ふん！" });
    const day = new Date().toISOString().slice(0, 10);
    const lines = readFileSync(join(dir, "children", "yuta", "sessions", `${day}.jsonl`), "utf8")
      .trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).text).toBe("こんにちは");
  });
  it("keeps only 10 recent lessons, newest first", () => {
    for (let i = 0; i < 12; i++) {
      recordLessonSummary(dir, "yuta", { unitId: `u${i}`, title: `t${i}`, summary: "s", date: "2026-07-18" });
    }
    const p = getProfile(dir, "yuta");
    expect(p.recentLessons).toHaveLength(10);
    expect(p.recentLessons[0].unitId).toBe("u11");
  });
});
