// 🔥 streak: how many days in a row a member has practiced. A day counts once
// a practice runs to the end with at least one drill finished (see
// KarateApp.finishSession); a second practice the same day adds nothing, and a
// missed day starts the count over. Stored per member through mem().

const KEY = "karate.streak";

interface StreakState {
  last: string;   // local date of the last counted practice, YYYY-MM-DD
  days: number;   // consecutive days ending on `last`
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function yesterdayKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return dayKey(d);
}

function load(storage: Storage): StreakState | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StreakState>;
    if (typeof p.last !== "string" || typeof p.days !== "number" || p.days < 1) return null;
    return { last: p.last, days: Math.floor(p.days) };
  } catch {
    return null;
  }
}

// Days in a row that are still alive: practiced today or yesterday, else 0.
export function currentStreak(storage: Storage = localStorage, now: Date = new Date()): number {
  const s = load(storage);
  if (!s) return 0;
  return s.last === dayKey(now) || s.last === yesterdayKey(now) ? s.days : 0;
}

// Count today's practice and return the streak including today.
export function recordPracticeDay(storage: Storage = localStorage, now: Date = new Date()): number {
  const today = dayKey(now);
  const s = load(storage);
  let days = 1;
  if (s?.last === today) days = s.days;
  else if (s?.last === yesterdayKey(now)) days = s.days + 1;
  try {
    storage.setItem(KEY, JSON.stringify({ last: today, days }));
  } catch {
    /* ignore storage errors */
  }
  return days;
}

// test アプリ only (家族 → テスト用): set the streak to `days` ending today, or
// clear it with 0.
export function setStreakDays(days: number, storage: Storage = localStorage, now: Date = new Date()): void {
  const n = Math.floor(days);
  try {
    if (!(n >= 1)) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify({ last: dayKey(now), days: n }));
  } catch {
    /* ignore storage errors */
  }
}
