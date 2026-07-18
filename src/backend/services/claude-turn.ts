import Anthropic from "@anthropic-ai/sdk";
import {
  parseTurnResult, TurnParseError, TURN_RESULT_JSON_SCHEMA,
  type TurnRequest, type TurnResult,
} from "../../shared/types/turn";
import { buildSystemBlocks, buildMessages, type ChildProfile } from "./prompt-builder";
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

export async function runTurn(
  client: ClaudeLike, model: string, lesson: Lesson,
  profile: ChildProfile, req: TurnRequest,
): Promise<TurnResult> {
  const params = {
    model,
    max_tokens: 700,
    system: buildSystemBlocks(lesson, profile),
    messages: buildMessages(req),
    output_config: { format: { type: "json_schema", schema: TURN_RESULT_JSON_SCHEMA } },
  };

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
    return parseTurnResult(textOf(resp));
  } catch (e) {
    if (!(e instanceof TurnParseError)) throw e;
    let again;
    try {
      again = await client.create(params); // one re-ask on malformed output
    } catch (e2) {
      throw new TurnServiceError("Claude API unavailable: " + String(e2));
    }
    try {
      return parseTurnResult(textOf(again));
    } catch {
      throw new TurnServiceError("Claude returned unparseable turn twice");
    }
  }
}

export function makeRealClient(): ClaudeLike {
  const anthropic = new Anthropic();
  return { create: (params) => anthropic.messages.create(params as never) as never };
}
