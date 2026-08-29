import type {
  TurnRequest, FollowupRequest, QuickTurnResult, FollowupResult,
} from "../shared/types/turn";

export interface Drop { xp: number; kind: string }
export interface Unlock { japanese_name: string; unlock_message: string }

const j = async (r: Response) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

// Turn calls go over WSL→Anthropic and occasionally drop before reaching the
// server. Time out (so a hung request doesn't strand the kid) and retry once —
// but ONLY on a network/timeout failure, never on an HTTP status. A status
// means the server already ran the turn (engagement, rewards); retrying it
// would double-count.
async function postTurn<T>(url: string, body: unknown, timeoutMs = 15000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`${r.status}`); // server responded — don't retry
      return (await r.json()) as T;
    } catch (e) {
      const networkFailure = e instanceof TypeError || (e as Error)?.name === "AbortError";
      if (networkFailure && attempt === 0) continue; // transient — one retry
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

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
  postTurn("/api/turn/quick", body);

export const postFollowup = (
  body: FollowupRequest & { voicedMs: number },
): Promise<{ turn: FollowupResult; drop: Drop | null; unlocked: Unlock[] }> =>
  postTurn("/api/turn/followup", body);

export const endSession = (body: { childName: string; unitId: string; summary: string }) =>
  fetch("/api/session/end", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);

export const ttsUrl = (text: string, speaker: number) =>
  `/api/tts?text=${encodeURIComponent(text)}&speaker=${speaker}`;
