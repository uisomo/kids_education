export class TtsUnavailableError extends Error {}

export async function synthesize(
  baseUrl: string, text: string, speaker: number, fetchFn: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  try {
    const q = await fetchFn(
      `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: "POST" },
    );
    if (!q.ok) throw new Error(`audio_query ${q.status}`);
    const query = await q.json();

    const s = await fetchFn(`${baseUrl}/synthesis?speaker=${speaker}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!s.ok) throw new Error(`synthesis ${s.status}`);
    return await s.arrayBuffer();
  } catch (e) {
    throw new TtsUnavailableError(String(e));
  }
}
