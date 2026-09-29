// 🔥 streak: a practice counts for the day once it runs to the end with at
// least one drill finished (see KarateApp.finishSession); a second practice the
// same day adds nothing. Stored per member through mem().
//
// The counting and the daily → weekly rule live in the series part
// (アランの基盤 packages/rewards → src/alan/alan-streak.js, SERIES_GUIDE 5.9):
// while the kid practices every day we show days in a row; once a day is
// missed we show weeks in a row (a week counts with one practice) instead of 0.
// The stored `{ last, days }` from before is read as is.

import {
  currentStreak as seriesCurrent,
  recordPractice,
  setStreakForTest,
  streakView,
  type StreakView,
} from "./alan/alan-streak.js";

const KEY = "karate.streak";

export type { StreakView };

/** What to show now: 毎日 (daily), 毎週 (weekly) or nothing. */
export function currentStreakView(storage: Storage = localStorage, now: Date = new Date()): StreakView {
  return streakView(storage, KEY, now);
}

/** Days in a row that are still alive (practiced today or yesterday), else 0. */
export function currentStreak(storage: Storage = localStorage, now: Date = new Date()): number {
  return seriesCurrent(storage, KEY, now).days;
}

/** Count today's practice and return what to show including today. */
export function recordPracticeDay(storage: Storage = localStorage, now: Date = new Date()): StreakView {
  recordPractice(storage, KEY, now);
  return streakView(storage, KEY, now);
}

/** 日継続中 / 週継続中 for the setup header and the video's top-left label. */
export function streakText(v: StreakView): string {
  return v.kind === "weekly" ? `${v.count}週継続中` : `${v.count}日継続中`;
}

// test アプリ only (家族 → テスト用): set the streak to `days` practiced up to
// YESTERDAY, or clear it with 0. It's a starting point, not a pin: today's
// practice then counts +1 like in the real app.
export function setStreakDays(days: number, storage: Storage = localStorage, now: Date = new Date()): void {
  setStreakForTest(storage, KEY, days, 0, now);
}
