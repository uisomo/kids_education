import { z } from "zod";

export const ENEMY_ACTIONS = [
  "idle", "angry", "cry", "laugh", "shock",
  "excitement", "dancing", "fighting", "flying", "sleep",
] as const;
export type EnemyAction = (typeof ENEMY_ACTIONS)[number];

export const PHASES = ["teach", "battle", "debrief", "end"] as const;
export type Phase = (typeof PHASES)[number];

const turnSchema = z.object({
  enemy_line: z.string(),
  enemy_action: z.enum(ENEMY_ACTIONS),
  coach_line: z.string(),
  damage: z.number().transform((n) => Math.max(0, Math.min(100, n))),
  score_reason: z.string(),
  phase: z.enum(PHASES),
  deep_question: z.string().nullable(),
});
export type TurnResult = z.infer<typeof turnSchema>;

export class TurnParseError extends Error {}

export function parseTurnResult(raw: string): TurnResult {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new TurnParseError(`not JSON: ${raw.slice(0, 80)}`);
  }
  const res = turnSchema.safeParse(obj);
  if (!res.success) throw new TurnParseError(res.error.message);
  return res.data;
}

export const TURN_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    enemy_line: { type: "string" },
    enemy_action: { type: "string", enum: [...ENEMY_ACTIONS] },
    coach_line: { type: "string" },
    damage: { type: "integer" },
    score_reason: { type: "string" },
    phase: { type: "string", enum: [...PHASES] },
    deep_question: { type: ["string", "null"] },
  },
  required: ["enemy_line", "enemy_action", "coach_line", "damage",
             "score_reason", "phase", "deep_question"],
  additionalProperties: false,
} as const;

export interface TurnRequest {
  childName: string;
  unitId: string;
  utterance: string;
  phase: Phase;
  history: { role: "kid" | "enemy" | "coach"; text: string }[];
}
