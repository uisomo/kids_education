// つづけた日（ストリーク）の 正本。SERIES_GUIDE 5.9。
// 正本は アランの基盤/packages/rewards/src/alan-streak.js。アプリへは brand/sync_brand.py で コピー（アプリの コピーは 手で 直さない）。
// おかね（バンドラーなし）でも つかえる ように ふつうの JS ＋ .d.ts。
//
// きまり（2026-09-29 uk）：
//   - 毎日 つづいて いれば 毎日（「3にち れんぞく」）を いつも 出す
//   - 毎日が とぎれたら 毎週（1週に 1回でも やった 週が つづいた 数。「4しゅう れんぞく」）を 出す
//   - とぎれても 0 に 見せない（毎週が のこって いれば それを 出す）
//
// つかい方は 2つ：
//   A. 練習した 日の 一覧が もう ある アプリ（きもち・おかね・英語・ボイス など）→ `streakViewFromDays(日の一覧)`。
//      あとから 計算できるので 何も 保存しない（5.9）
//   B. 一覧が ない アプリ（空手）→ `recordPractice()` で 数えて 保存、`streakView()` で 出す
//
// B の 保存：`<アプリ名>.streak` = { last: "YYYY-MM-DD", days, week: "YYYY-MM-DD"（その週の 月曜）, weeks }
//   子どもごとに わける ときは memberStorage()（`m:<id>:`）を わたす。
//   むかしの { last, days }（空手 など）も そのまま 読める（week が なければ last の 週・weeks 1 と みなす）。

/** 毎日が「ある」とみなす 日数。1日だけ（やりなおしの 1日め）より 毎週の 数の ほうが 大きければ 毎週を 出す */
export const DAILY_MIN = 2;

/** 端末の 時計での 日付 "YYYY-MM-DD" */
export function dayKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function parseDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** その日の 週の 月曜 "YYYY-MM-DD"（週は 月曜はじまり） */
export function weekKey(d) {
  return dayKey(addDays(d, -((d.getDay() + 6) % 7)));
}

/** 保存されて いる 形を 読む。こわれて いれば null */
export function loadStreak(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.last !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.last)) return null;
    if (typeof p.days !== "number" || p.days < 1) return null;
    const days = Math.floor(p.days);
    const hasWeek = typeof p.week === "string" && typeof p.weeks === "number" && p.weeks >= 1;
    return {
      last: p.last,
      days,
      week: hasWeek ? p.week : weekKey(parseDay(p.last)),
      weeks: hasWeek ? Math.floor(p.weeks) : 1,
    };
  } catch {
    return null;
  }
}

/** いまも つづいて いる 日数・週数（とぎれて いれば 0） */
export function currentStreak(storage, key, now = new Date()) {
  const s = loadStreak(storage, key);
  if (!s) return { days: 0, weeks: 0 };
  const daily = s.last === dayKey(now) || s.last === dayKey(addDays(now, -1));
  const thisWeek = weekKey(now);
  const weekly = s.week === thisWeek || s.week === weekKey(addDays(now, -7));
  return { days: daily ? s.days : 0, weeks: weekly ? s.weeks : 0 };
}

/** 練習した 日の 一覧（"YYYY-MM-DD"。ならび・かさなりは 気に しない）から いまの 日数・週数 */
export function streakFromDays(dayKeys, now = new Date()) {
  const set = new Set(dayKeys);
  let d = set.has(dayKey(now)) ? now : addDays(now, -1);
  let days = 0;
  while (set.has(dayKey(d))) { days++; d = addDays(d, -1); }
  const weeksSet = new Set([...set].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).map((k) => weekKey(parseDay(k))));
  let w = parseDay(weekKey(now));
  if (!weeksSet.has(dayKey(w))) w = addDays(w, -7);
  let weeks = 0;
  while (weeksSet.has(dayKey(w))) { weeks++; w = addDays(w, -7); }
  return { days, weeks };
}

/**
 * 日数・週数 → 画面に 出す もの。
 * kind: "daily"（毎日）／"weekly"（毎週）／"none"（まだ・ぜんぶ とぎれた）
 */
export function viewOf({ days, weeks }) {
  if (days >= 1 && (days >= DAILY_MIN || weeks <= 1)) {
    return { kind: "daily", count: days, label: `${days}にち れんぞく`, short: `${days}日` };
  }
  if (weeks >= 1) return { kind: "weekly", count: weeks, label: `${weeks}しゅう れんぞく`, short: `${weeks}週` };
  return { kind: "none", count: 0, label: "", short: "0日" };
}

/** A：日の 一覧から 画面に 出す もの */
export function streakViewFromDays(dayKeys, now = new Date()) {
  return viewOf(streakFromDays(dayKeys, now));
}

/** B：保存した 形から 画面に 出す もの */
export function streakView(storage, key, now = new Date()) {
  return viewOf(currentStreak(storage, key, now));
}

/** きょう やった ことを 数える（おなじ 日の 2回めは ふえない）。数えた あとの 形を かえす */
export function recordPractice(storage, key, now = new Date()) {
  const today = dayKey(now);
  const thisWeek = weekKey(now);
  const s = loadStreak(storage, key);
  let days = 1;
  if (s?.last === today) days = s.days;
  else if (s?.last === dayKey(addDays(now, -1))) days = s.days + 1;
  let weeks = 1;
  if (s?.week === thisWeek) weeks = s.weeks;
  else if (s?.week === weekKey(addDays(now, -7))) weeks = s.weeks + 1;
  const next = { last: today, days, week: thisWeek, weeks };
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    /* 保存できなくても 練習は とめない */
  }
  return next;
}

/** テスト用（家族タブの テスト）：きのうまで `days` 日・先週まで `weeks` 週 つづいた ことに する。0 で けす */
export function setStreakForTest(storage, key, days, weeks = 0, now = new Date()) {
  const d = Math.floor(days);
  const w = Math.floor(weeks);
  try {
    if (!(d >= 1) && !(w >= 1)) { storage.removeItem(key); return; }
    const y = addDays(now, -1);
    if (d >= 1) {
      // きのうが 今週なら 今週も 1週と 数える
      const weekOfY = weekKey(y);
      storage.setItem(key, JSON.stringify({ last: dayKey(y), days: d, week: weekOfY, weeks: Math.max(1, w) }));
    } else {
      const lastWeek = addDays(now, -7);
      storage.setItem(key, JSON.stringify({ last: weekKey(lastWeek), days: 1, week: weekKey(lastWeek), weeks: w }));
    }
  } catch {
    /* ignore */
  }
}
