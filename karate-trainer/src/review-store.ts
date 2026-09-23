// ★ The App Store rating ask. Nobody writes a review from a kids' app, but a
// tap on five stars costs a parent nothing — so from the SECOND day on, the
// app opens Apple's own rating sheet (stars only, no writing) once.
//
// Apple's sheet decides for itself whether to appear (it never shows to
// someone who already rated this version, and at most three times a year), so
// this only tracks the chance to ask: not on the first day, not twice in the
// same season, and not more than three times ever.

const KEY = "karate.review";

// How long before asking again if Apple's sheet went unanswered.
const AGAIN_AFTER_DAYS = 60;
const MAX_ASKS = 3;

interface ReviewState {
  // Local date of the first launch we saw, YYYY-MM-DD.
  first: string;
  // Local date the sheet was last asked for, or null.
  asked: string | null;
  askCount: number;
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86400000);
}

function load(storage: Storage, now: Date): ReviewState {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<ReviewState>;
      if (typeof v.first === "string") {
        return {
          first: v.first,
          asked: typeof v.asked === "string" ? v.asked : null,
          askCount: typeof v.askCount === "number" ? v.askCount : 0,
        };
      }
    }
  } catch {
    /* fall through to a fresh state */
  }
  return { first: dayKey(now), asked: null, askCount: 0 };
}

function save(state: ReviewState, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
  }
}

// Called on every launch: remembers the first day, and answers whether this
// launch is a good moment to ask. Asking itself is markReviewAsked().
export function shouldAskReview(storage: Storage = localStorage, now: Date = new Date()): boolean {
  const state = load(storage, now);
  save(state, storage);                       // first launch: remember the day
  const today = dayKey(now);
  if (today === state.first) return false;    // day one is for using the app
  if (state.askCount >= MAX_ASKS) return false;
  if (state.asked && daysBetween(state.asked, today) < AGAIN_AFTER_DAYS) return false;
  return true;
}

export function markReviewAsked(storage: Storage = localStorage, now: Date = new Date()): void {
  const state = load(storage, now);
  save({ ...state, asked: dayKey(now), askCount: state.askCount + 1 }, storage);
}
