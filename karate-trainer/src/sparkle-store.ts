// ✨キラキラ を あつめる。どれを持っているかは **もらった帯の数だけ** で決まる。
//
//   カタログの順に開いていくが、**ハードルは だんだん上がる**:
//   はじめの6つは 5本ずつ、つぎの6つは 10本ずつ、そのつぎの6つは 15本ずつ…
//   （のべでは 6つめ=30本、12こめ=90本、18こめ=180本、24こめ=300本）
//
// 「最初から持っているもの」（tier が start）は、帯が 0本でも使える。
//
// なぜ帯の数にするか: 帯はメニューを最後まで積み上げないともらえないので、
// 「長い稽古を1回」ではなく「続けたこと」のごほうびになる。持ちものの一覧を
// 別に保存しないので、数と一覧がずれることもない。
//
// 古い決まり（3分・5分のメニューをやり切ると1つ）で開けたものは、
// `karate.sparkles` に残っている。**取り上げない** ので、そこに入っているものは
// これからも持ったまま。

import { SPARKLES, type SparkleDef } from "./sparkle-catalog";
import { IS_PIANO } from "./flavor";
import { beltCount } from "./belt-collection-store";

const KEY = "karate.sparkles";

/// 何個ごとに ハードルが上がるか。
export const SPARKLES_PER_STEP = 6;
/// はじめのかたまりの「1つあたり何本」。かたまりが進むごとに これだけ増える。
export const BELTS_PER_SPARKLE = 5;

/// n個め（1から）の キラキラ 1つぶんに要る 帯の本数（5 → 10 → 15 …）。
export function beltsForSparkle(n: number): number {
  return BELTS_PER_SPARKLE * (Math.floor(Math.max(0, n - 1) / SPARKLES_PER_STEP) + 1);
}

/// n個めを開けるまでに要る、**のべ**の帯の本数。
export function beltsNeededFor(n: number): number {
  let total = 0;
  for (let i = 1; i <= n; i++) total += beltsForSparkle(i);
  return total;
}

/// このアプリ（空手／ピアノ）の キラキラ を、開く順に。
export const MY_SPARKLES: SparkleDef[] = SPARKLES.filter(
  (s) => s.mode === (IS_PIANO ? "piano" : "karate"),
);

/// 最初から持っているもの。
const STARTERS: SparkleDef[] = MY_SPARKLES.filter((s) => s.tier === "start");
/// 帯で開いていくもの（この順に開く）。
const EARNED: SparkleDef[] = MY_SPARKLES.filter((s) => s.tier !== "start");

export function sparkleById(id: string): SparkleDef | undefined {
  return MY_SPARKLES.find((s) => s.id === id);
}

/// 古い決まりで開けたものの id（保存に残っているもの）。
function savedIds(storage: Storage): string[] {
  try {
    const raw = storage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/// 帯の数だけで開いている数（最初から持っているものは数えない）。
export function earnedCount(storage: Storage = localStorage): number {
  const belts = beltCount(storage);
  let n = 0;
  while (n < EARNED.length && beltsNeededFor(n + 1) <= belts) n++;
  return n;
}

/// この キラキラ を開けるのに要る、のべ帯の本数（最初から持っているものは null）。
export function beltsToOwn(id: string): number | null {
  const at = EARNED.findIndex((s) => s.id === id);
  return at < 0 ? null : beltsNeededFor(at + 1);
}

/// 持っているキラキラの id。並びはカタログ順（画面もこの順に出す）。
export function loadUnlocked(storage: Storage = localStorage): string[] {
  const have = new Set([
    ...STARTERS.map((s) => s.id),
    ...EARNED.slice(0, earnedCount(storage)).map((s) => s.id),
    ...savedIds(storage),
  ]);
  return MY_SPARKLES.filter((s) => have.has(s.id)).map((s) => s.id);
}

export function isUnlocked(id: string, storage: Storage = localStorage): boolean {
  return loadUnlocked(storage).includes(id);
}

/// つぎに開くキラキラと、あと何本の帯が要るか。ぜんぶ持っていれば null。
export function nextToUnlock(
  storage: Storage = localStorage,
): { sparkle: SparkleDef; remaining: number } | null {
  const have = new Set(loadUnlocked(storage));
  const sparkle = EARNED.find((s) => !have.has(s.id));
  if (!sparkle) return null;
  // その1つの のべ本数から、いま持っている帯を引く（かたまりで変わるので
  // 「5で割ったあまり」では出せない）。
  const remaining = Math.max(1, (beltsToOwn(sparkle.id) ?? 0) - beltCount(storage));
  return { sparkle, remaining };
}

/// test アプリ（家族 → テスト用）だけ: 持っているキラキラを直接書き換える。
/// 帯で開くぶんは消せないので、ここで書けるのは「おまけで持っているもの」。
export function setUnlocked(ids: string[], storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(MY_SPARKLES.filter((s) => ids.includes(s.id)).map((s) => s.id)));
  } catch {
    /* ignore storage errors */
  }
}
