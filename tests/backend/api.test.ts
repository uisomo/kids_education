import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync, writeFileSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeApp } from "../../src/backend/api/routes";

const goodTurn = JSON.stringify({
  enemy_line: "ぐぬぬ", enemy_action: "shock", coach_line: "いいね！",
  damage: 40, score_reason: "reason", phase: "battle", deep_question: null,
});

let dataDir: string;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tq-"));
  writeFileSync(join(dataDir, "characters.csv"), "child,stat,points\n");
  writeFileSync(join(dataDir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n");
  const claude = { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: goodTurn }] }) };
  app = makeApp({
    config: { model: "claude-haiku-4-5", port: 0, voicevoxUrl: "http://127.0.0.1:1", dataDir, contentDir: "content" },
    claude,
  });
});

describe("api", () => {
  it("lists lessons", async () => {
    const r = await request(app).get("/api/lessons/negotiation");
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(3);
  });
  it("starts a session and returns lesson + profile", async () => {
    const r = await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    expect(r.status).toBe(200);
    expect(r.body.lesson.enemy.name).toContain("ゴルド");
    expect(r.body.profile.name).toBe("yuta");
  });
  it("runs a turn and returns turn result", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    const r = await request(app).post("/api/turn").send({
      childName: "yuta", unitId: "unit-01", utterance: "やすくして！",
      phase: "battle", history: [], voicedMs: 3000,
    });
    expect(r.status).toBe(200);
    expect(r.body.turn.damage).toBe(40);
    expect(r.body).toHaveProperty("drop");
  });
  it("ends a session, cashing drops into the reward stat", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-01" });
    await request(app).post("/api/turn").send({
      childName: "yuta", unitId: "unit-01", utterance: "a", phase: "battle",
      history: [], voicedMs: 60000,
    });
    const r = await request(app).post("/api/session/end")
      .send({ childName: "yuta", unitId: "unit-01", summary: "りゆうをつけて交渉できた" });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.drops)).toBe(true);
  });
  it("tts returns 503 when engine is down", async () => {
    const r = await request(app).get("/api/tts?text=hi&speaker=1");
    expect(r.status).toBe(503);
  });
  it("rejects path-traversal in unitId", async () => {
    const r = await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "../unit-01" });
    expect(r.status).toBe(400);
  });
  it("returns 404 for unknown unit", async () => {
    const r = await request(app).post("/api/session/start")
      .send({ childName: "yuta", subject: "negotiation", unitId: "unit-99" });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("unknown unit");
  });
});
