import express from "express";
import type { AppConfig } from "../config";
import { listLessons, loadLesson } from "../services/lesson-store";
import { getProfile, appendTranscript, recordLessonSummary } from "../services/profile-store";
import { runTurn, type ClaudeLike, TurnServiceError } from "../services/claude-turn";
import { applyReward } from "../services/progression";
import { EngagementBank, type Drop } from "../services/reward-scheduler";
import { synthesize, TtsUnavailableError } from "../services/tts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// Request fields childName/subject/unitId flow straight into filesystem paths
// (lesson-store, profile-store), so they're restricted to a safe charset —
// no dots or slashes — before any lookup happens. Anything else is a 400.
const SAFE_NAME = /^[\p{L}\p{N}_-]{1,32}$/u; // letters (incl. Japanese), digits, _ , - ; no dots/slashes
function safe(...vals: unknown[]): boolean {
  return vals.every((v) => typeof v === "string" && SAFE_NAME.test(v));
}

function engagementPath(dataDir: string, child: string) {
  return join(dataDir, "children", child, "engagement.json");
}
function readCarry(dataDir: string, child: string): number {
  const p = engagementPath(dataDir, child);
  if (!existsSync(p)) return 0;
  return JSON.parse(readFileSync(p, "utf8")).carryMs ?? 0;
}
function writeCarry(dataDir: string, child: string, carryMs: number) {
  const p = engagementPath(dataDir, child);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ carryMs }));
}

export function makeApp(deps: { config: AppConfig; claude: ClaudeLike }) {
  const { config, claude } = deps;
  const app = express();
  app.use(express.json());

  const banks = new Map<string, EngagementBank>();
  const bankKey = (child: string, unit: string) => `${child}:${unit}`;

  app.get("/api/lessons/:subject", (req, res) => {
    if (!safe(req.params.subject)) {
      res.status(400).json({ error: "invalid subject" });
      return;
    }
    res.json(listLessons(config.contentDir, req.params.subject));
  });

  app.post("/api/session/start", (req, res) => {
    const { childName, subject, unitId } = req.body;
    if (!safe(childName, subject, unitId)) {
      res.status(400).json({ error: "invalid childName, subject, or unitId" });
      return;
    }
    let lesson;
    try {
      lesson = loadLesson(config.contentDir, subject, unitId);
    } catch {
      res.status(404).json({ error: "unknown unit" });
      return;
    }
    try {
      const profile = getProfile(config.dataDir, childName);
      const carriedMs = readCarry(config.dataDir, childName);
      banks.set(bankKey(childName, unitId), new EngagementBank({ carriedMs }));
      writeCarry(config.dataDir, childName, 0);
      appendTranscript(config.dataDir, childName, { kind: "session-start", unitId });
      res.json({ lesson, profile, carriedMs });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/turn", async (req, res) => {
    const { childName, unitId, utterance, phase, history, voicedMs } = req.body;
    if (!safe(childName, unitId)) {
      res.status(400).json({ error: "invalid childName or unitId" });
      return;
    }
    let lesson;
    try {
      lesson = loadLesson(config.contentDir, lessonSubject(unitId, config), unitId);
    } catch {
      res.status(404).json({ error: "unknown unit" });
      return;
    }
    try {
      const profile = getProfile(config.dataDir, childName);
      const bank = banks.get(bankKey(childName, unitId));
      bank?.addVoicedMs(voicedMs ?? 0);
      const turn = await runTurn(claude, config.model, lesson, profile,
        { childName, unitId, utterance, phase, history });
      const drop: Drop | null = bank?.maybeDrop() ?? null;
      writeCarry(config.dataDir, childName, bank?.accruedMs ?? 0);
      const unlocked = drop
        ? applyReward(config.dataDir, childName, lesson.reward.stat, drop.xp).unlocked
        : [];
      appendTranscript(config.dataDir, childName, { kind: "kid", text: utterance });
      appendTranscript(config.dataDir, childName, {
        kind: "turn", enemy: turn.enemy_line, coach: turn.coach_line,
        damage: turn.damage, deep_question: turn.deep_question, drop,
      });
      res.json({ turn, drop, unlocked });
    } catch (e) {
      if (e instanceof TurnServiceError) {
        res.status(502).json({ error: String(e) });
      } else {
        res.status(500).json({ error: String(e) });
      }
    }
  });

  app.post("/api/session/end", (req, res) => {
    const { childName, unitId, summary } = req.body;
    if (!safe(childName, unitId)) {
      res.status(400).json({ error: "invalid childName or unitId" });
      return;
    }
    let lesson;
    try {
      lesson = loadLesson(config.contentDir, lessonSubject(unitId, config), unitId);
    } catch {
      res.status(404).json({ error: "unknown unit" });
      return;
    }
    try {
      const bank = banks.get(bankKey(childName, unitId));
      let drops: Drop[] = [];
      let unlocked: { japanese_name: string; unlock_message: string }[] = [];
      if (bank) {
        const out = bank.endOfSession();
        drops = out.drops;
        writeCarry(config.dataDir, childName, out.carryMs);
        for (const d of drops) {
          unlocked = unlocked.concat(
            applyReward(config.dataDir, childName, lesson.reward.stat, d.xp).unlocked,
          );
        }
        banks.delete(bankKey(childName, unitId));
      }
      recordLessonSummary(config.dataDir, childName, {
        unitId, title: lesson.title, summary,
        date: new Date().toISOString().slice(0, 10),
      });
      appendTranscript(config.dataDir, childName, { kind: "session-end", unitId, summary, drops });
      res.json({ drops, unlocked });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/tts", async (req, res) => {
    try {
      const wav = await synthesize(
        config.voicevoxUrl, String(req.query.text ?? ""), Number(req.query.speaker ?? 1),
      );
      res.type("audio/wav").send(Buffer.from(wav));
    } catch (e) {
      if (e instanceof TtsUnavailableError) res.status(503).json({ error: "tts-unavailable" });
      else res.status(500).json({ error: String(e) });
    }
  });

  return app;
}

// v1: all units live under negotiation; when more subjects arrive, the client
// sends subject explicitly and this helper goes away.
function lessonSubject(_unitId: string, _config: AppConfig): string {
  return "negotiation";
}
