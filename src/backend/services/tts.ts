export class TtsUnavailableError extends Error {}

// WSL mirrored networking makes connections to a closed localhost port hang
// ~10s instead of refusing — one hang per spoken line kills conversation flow.
// So: short connect timeout, and remember an unreachable engine for a while.
const CONNECT_TIMEOUT_MS = 1_500;
const SYNTH_TIMEOUT_MS = 10_000;
const DOWN_CACHE_MS = 30_000;
let downUntil = 0;

export function resetTtsAvailabilityCache(): void { downUntil = 0; }

export async function synthesize(
  baseUrl: string, text: string, speaker: number, speed = 1.2, fetchFn: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  if (Date.now() < downUntil) throw new TtsUnavailableError("engine recently unreachable");
  let query: unknown;
  try {
    const q = await fetchFn(
      `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: "POST", signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) },
    );
    if (!q.ok) throw new TtsUnavailableError(`audio_query ${q.status}`);
    query = await q.json();
  } catch (e) {
    if (!(e instanceof TtsUnavailableError)) downUntil = Date.now() + DOWN_CACHE_MS;
    throw new TtsUnavailableError(String(e));
  }
  try {
    (query as { speedScale: number }).speedScale = speed;
    const s = await fetchFn(`${baseUrl}/synthesis?speaker=${speaker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
    if (!s.ok) throw new Error(`synthesis ${s.status}`);
    return await s.arrayBuffer();
  } catch (e) {
    throw new TtsUnavailableError(String(e));
  }
}
