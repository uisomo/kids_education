import { it, expect } from "vitest";
import { currentStreak, recordPracticeDay } from "../../karate-trainer/src/streak-store";

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
  expect(recordPracticeDay(s, day(10))).toBe(1);
  expect(recordPracticeDay(s, day(10, 21))).toBe(1);   // same day again
  expect(recordPracticeDay(s, day(11, 7))).toBe(2);
  expect(recordPracticeDay(s, day(12))).toBe(3);
  expect(currentStreak(s, day(13))).toBe(3);           // still alive the next day
});

it("a missed day ends the streak and the next practice starts over", () => {
  const s = memStorage();
  recordPracticeDay(s, day(1));
  recordPracticeDay(s, day(2));
  expect(currentStreak(s, day(4))).toBe(0);
  expect(recordPracticeDay(s, day(4))).toBe(1);
});

it("carries over a month end", () => {
  const s = memStorage();
  recordPracticeDay(s, new Date(2026, 7, 31, 18));
  expect(recordPracticeDay(s, new Date(2026, 8, 1, 18))).toBe(2);
});
