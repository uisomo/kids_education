import Anthropic from "@anthropic-ai/sdk";
import {
  parseQuickTurn, parseFollowup, TurnParseError,
  QUICK_TURN_JSON_SCHEMA, FOLLOWUP_JSON_SCHEMA,
  type TurnRequest, type FollowupRequest, type QuickTurnResult, type FollowupResult,
} from "../../shared/types/turn";
import {
  buildSystemBlocks, buildQuickMessages, buildFollowupMessages, type ChildProfile,
} from "./prompt-builder";
import type { Lesson } from "./lesson-store";

export interface ClaudeLike {
  create(params: Record<string, unknown>): Promise<{ content: { type: string; text?: string }[] }>;
}

export class TurnServiceError extends Error {}

function textOf(resp: { content: { type: string; text?: string }[] }): string {
  const block = resp.content.find((b) => b.type === "text");
  if (!block?.text) throw new TurnParseError("no text block in response");
  return block.text;
}

async function callParsed<T>(
  client: ClaudeLike, params: Record<string, unknown>, parse: (raw: string) => T,
): Promise<T> {
  let resp;
  try {
    resp = await client.create(params);
  } catch {
    try {
      resp = await client.create(params); // one retry on API error
    } catch (e) {
      throw new TurnServiceError("Claude API unavailable: " + String(e));
    }
  }

  try {
    return parse(textOf(resp));
  } catch (e) {
    if (!(e instanceof TurnParseError)) throw e;
    let again;
    try {
      again = await client.create(params); // one re-ask on malformed output
    } catch (e2) {
      throw new TurnServiceError("Claude API unavailable: " + String(e2));
    }
    try {
      return parse(textOf(again));
    } catch {
      throw new TurnServiceError("Claude returned unparseable turn twice");
    }
  }
}

export function runQuickTurn(
  client: ClaudeLike, model: string, lesson: Lesson,
  profile: ChildProfile, req: TurnRequest,
): Promise<QuickTurnResult> {
  return callParsed(client, {
    model,
    max_tokens: 250,
    system: buildSystemBlocks(lesson, profile),
    messages: buildQuickMessages(req),
    output_config: { format: { type: "json_schema", schema: QUICK_TURN_JSON_SCHEMA } },
  }, parseQuickTurn);
}

export function runFollowup(
  client: ClaudeLike, model: string, lesson: Lesson,
  profile: ChildProfile, req: FollowupRequest,
): Promise<FollowupResult> {
  return callParsed(client, {
    model,
    max_tokens: 500,
    system: buildSystemBlocks(lesson, profile),
    messages: buildFollowupMessages(req),
    output_config: { format: { type: "json_schema", schema: FOLLOWUP_JSON_SCHEMA } },
  }, parseFollowup);
}

export function makeRealClient(): ClaudeLike {
  const anthropic = new Anthropic();
  return { create: (params) => anthropic.messages.create(params as never) as never };
}
