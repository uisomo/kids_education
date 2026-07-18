import { z } from "zod";

export const ENEMY_ACTIONS = [
  "idle", "angry", "cry", "laugh", "shock",
  "excitement", "dancing", "fighting", "flying", "sleep",
] as const;
export type EnemyAction = (typeof ENEMY_ACTIONS)[number];

export const PHASES = ["teach", "battle", "debrief", "end"] as const;
export type Phase = (typeof PHASES)[number];

const damageField = z.number().transform((n) => Math.round(Math.max(0, Math.min(100, n))));

// The turn is split in two Claude calls so the enemy can answer fast:
// quick = the enemy's immediate reply, followup = coaching/scoring/phase.
const quickSchema = z.object({
  enemy_line: z.string(),
  enemy_action: z.enum(ENEMY_ACTIONS),
  damage: damageField,
}).strict();
export type QuickTurnResult = z.infer<typeof quickSchema>;

const followupSchema = z.object({
  coach_line: z.string(),
  score_reason: z.string(),
  phase: z.enum(PHASES),
  deep_question: z.string().nullable(),
}).strict();
export type FollowupResult = z.infer<typeof followupSchema>;

export class TurnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnParseError";
  }
}

function parseWith<T>(schema: z.ZodType<T>, raw: string): T {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new TurnParseError(`not JSON: ${raw.slice(0, 80)}`);
  }
  const res = schema.safeParse(obj);
  if (!res.success) throw new TurnParseError(res.error.message);
  return res.data;
}

export const parseQuickTurn = (raw: string): QuickTurnResult => parseWith(quickSchema, raw);
export const parseFollowup = (raw: string): FollowupResult => parseWith(followupSchema, raw);

export const QUICK_TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    enemy_line: { type: "string" },
    enemy_action: { type: "string", enum: [...ENEMY_ACTIONS] },
    damage: { type: "integer" },
  },
  required: ["enemy_line", "enemy_action", "damage"],
  additionalProperties: false,
} as const;

export const FOLLOWUP_JSON_SCHEMA = {
  type: "object",
  properties: {
    coach_line: { type: "string" },
    score_reason: { type: "string" },
    phase: { type: "string", enum: [...PHASES] },
    deep_question: { type: ["string", "null"] },
  },
  required: ["coach_line", "score_reason", "phase", "deep_question"],
  additionalProperties: false,
} as const;

export interface TurnRequest {
  childName: string;
  unitId: string;
  utterance: string;
  phase: Phase;
  history: { role: "kid" | "enemy" | "coach"; text: string }[];
}

// history already contains the kid's utterance and the quick enemy reply.
export interface FollowupRequest extends TurnRequest {
  enemyLine: string;
  damage: number;
  remainingHp: number;
  maxHp: number;
}

// Combined shape kept for client-side convenience (quick + followup merged).
export type TurnResult = QuickTurnResult & FollowupResult;
