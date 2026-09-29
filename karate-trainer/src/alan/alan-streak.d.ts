// alan-streak.js の 型（SERIES_GUIDE 5.9）。sync で アプリへ。手で 直さない。
export interface StreakState {
  /** さいごに 数えた 日 "YYYY-MM-DD" */
  last: string;
  /** last で おわる 毎日の れんぞく */
  days: number;
  /** さいごに 数えた 週の 月曜 "YYYY-MM-DD" */
  week: string;
  /** week で おわる 毎週の れんぞく */
  weeks: number;
}
export interface StreakStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface StreakView {
  kind: "daily" | "weekly" | "none";
  count: number;
  /** 「3にち れんぞく」「4しゅう れんぞく」／ none は "" */
  label: string;
  /** せまい チップ用：「3日」「2週」／ none は "0日" */
  short: string;
}
export const DAILY_MIN: number;
export function dayKey(d: Date): string;
export function weekKey(d: Date): string;
export function loadStreak(storage: StreakStorage, key: string): StreakState | null;
export function currentStreak(storage: StreakStorage, key: string, now?: Date): { days: number; weeks: number };
export interface StreakCounts { days: number; weeks: number }
export function streakFromDays(dayKeys: Iterable<string>, now?: Date): StreakCounts;
export function viewOf(counts: StreakCounts): StreakView;
export function streakViewFromDays(dayKeys: Iterable<string>, now?: Date): StreakView;
export function streakView(storage: StreakStorage, key: string, now?: Date): StreakView;
export function recordPractice(storage: StreakStorage, key: string, now?: Date): StreakState;
export function setStreakForTest(storage: StreakStorage, key: string, days: number, weeks?: number, now?: Date): void;
