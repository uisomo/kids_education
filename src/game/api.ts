import type {
  TurnRequest, FollowupRequest, QuickTurnResult, FollowupResult,
} from "../shared/types/turn";

export interface Drop { xp: number; kind: string }
export interface Unlock { japanese_name: string; unlock_message: string }

const j = async (r: Response) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

export const listLessons = (subject: string): Promise<{ id: string; title: string }[]> =>
  fetch(`/api/lessons/${subject}`).then(j);

export const startSession = (childName: string, subject: string, unitId: string) =>
  fetch("/api/session/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ childName, subject, unitId }),
  }).then(j);

export const postQuickTurn = (
  body: TurnRequest,
): Promise<{ turn: QuickTurnResult }> =>
  fetch("/api/turn/quick", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const postFollowup = (
  body: FollowupRequest & { voicedMs: number },
): Promise<{ turn: FollowupResult; drop: Drop | null; unlocked: Unlock[] }> =>
  fetch("/api/turn/followup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const endSession = (body: { childName: string; unitId: string; summary: string }) =>
  fetch("/api/session/end", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const ttsUrl = (text: string, speaker: number) =>
  `/api/tts?text=${encodeURIComponent(text)}&speaker=${speaker}`;
