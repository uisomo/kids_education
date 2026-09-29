import { it, expect } from "vitest";
import { currentStreak, currentStreakView, recordPracticeDay, streakText } from "../../karate-trainer/src/streak-store";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const day = (d: number, h = 18) => new Date(2026, 8, d, h);   // September 2026

it("counts consecutive days, once per day, across midnight", () => {
  const s = memStorage();
  expect(currentStreak(s, day(10))).toBe(0);
  expect(recordPracticeDay(s, day(10)).count).toBe(1);
  expect(recordPracticeDay(s, day(10, 21)).count).toBe(1);   // same day again
  expect(recordPracticeDay(s, day(11, 7)).count).toBe(2);
  expect(recordPracticeDay(s, day(12)).count).toBe(3);
  expect(currentStreak(s, day(13))).toBe(3);           // still alive the next day
});

it("a missed day ends the streak and the next practice starts over", () => {
  const s = memStorage();
  recordPracticeDay(s, day(1));
  recordPracticeDay(s, day(2));
  expect(currentStreak(s, day(4))).toBe(0);
  expect(recordPracticeDay(s, day(4)).count).toBe(1);
});

// SERIES_GUIDE 5.9: once a day is missed, weeks in a row instead of 0.
it("after a missed day it shows weeks in a row, and days again once they run", () => {
  const s = memStorage();
  recordPracticeDay(s, day(9));                        // Wed, week of Mon 7
  expect(currentStreakView(s, day(12)).kind).toBe("weekly");
  expect(streakText(currentStreakView(s, day(12)))).toBe("1週継続中");
  const v = recordPracticeDay(s, day(15));             // Tue, next week
  expect([v.kind, v.count]).toEqual(["weekly", 2]);
  const w = recordPracticeDay(s, day(16));
  expect(streakText(w)).toBe("2日継続中");
  expect(currentStreakView(s, day(29)).kind).toBe("none"); // two weeks missed
});

it("reads the old { last, days } shape as is", () => {
  const s = memStorage();
  s.setItem("karate.streak", JSON.stringify({ last: "2026-09-12", days: 7 }));
  expect(currentStreak(s, day(13))).toBe(7);
  expect(recordPracticeDay(s, day(13)).count).toBe(8);
});

it("carries over a month end", () => {
  const s = memStorage();
  recordPracticeDay(s, new Date(2026, 7, 31, 18));
  expect(recordPracticeDay(s, new Date(2026, 8, 1, 18)).count).toBe(2);
});
