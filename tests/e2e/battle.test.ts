import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeApp } from "../../src/backend/api/routes";
import { makeMockClaude } from "../../src/backend/services/mock-claude";

let dataDir: string;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "tq-e2e-"));
  writeFileSync(join(dataDir, "characters.csv"), "child,stat,points\n");
  writeFileSync(join(dataDir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n" +
    "accessory,1,/x.png,1,charisma,こうしょうバッジ,🗣️,d,こうしょうバッジを手に入れた！\n");
  app = makeApp({
    config: { model: "claude-haiku-4-5", port: 0, voicevoxUrl: "http://127.0.0.1:1", dataDir, contentDir: "content" },
    claude: makeMockClaude(),
  });
});

describe("scripted battle e2e", () => {
  it("plays a full battle: start → turns until end → session end updates CSV", async () => {
    await request(app).post("/api/session/start")
      .send({ childName: "e2e", subject: "negotiation", unitId: "unit-01" });

    const history: object[] = [];
    let phase = "battle";
    let turns = 0;
    while (phase !== "end" && turns < 10) {
      const r = await request(app).post("/api/turn").send({
        childName: "e2e", unitId: "unit-01",
        utterance: `おてつだいするから、やすくして（${turns}）`,
        phase, history, voicedMs: 30000,
      });
      expect(r.status).toBe(200);
      phase = r.body.turn.phase;
      turns++;
    }
    expect(phase).toBe("end");
    expect(turns).toBeGreaterThanOrEqual(3);

    const end = await request(app).post("/api/session/end")
      .send({ childName: "e2e", unitId: "unit-01", summary: "りゆう交渉ができた" });
    expect(end.status).toBe(200);

    const csv = readFileSync(join(dataDir, "characters.csv"), "utf8");
    expect(csv).toContain("e2e,charisma,");           // xp landed in CSV
    const profile = JSON.parse(
      readFileSync(join(dataDir, "children", "e2e", "profile.json"), "utf8"));
    expect(profile.recentLessons[0].summary).toBe("りゆう交渉ができた");
  });
});
