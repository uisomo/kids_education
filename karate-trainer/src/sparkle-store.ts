// ✨キラキラ を あつめる。どれを持っているか（人ごと）と、稽古1回で
// 新しい1つが開くかどうかの決まり。
//
// **一度に全部は開かない。** 開くのは 1回の稽古につき 多くても 1つ。集める
// ことそのものが ごほうびなので、最初から全部あると集める理由が無くなる。
//
// 決まり（[[karate-practice-credit-rules]] の「やり切った」と同じ考えかた）:
//
//   start … 最初から持っている
//   short … **3分いじょう** のメニューを、飛ばさず最後までやり切ったら 1つ
//   long  … **休憩が1つも無い 5分いじょう** のメニューを、飛ばさず最後まで
//            やり切ったら 1つ
//
// long の条件を満たした稽古は short の条件も満たしている。そのときは long を
// 先に開け、long が全部そろっていたら short を開ける（がんばった稽古が
// 「何ももらえなかった」で終わらないように）。

import type { Menu } from "./types";
import { SPARKLES, type SparkleDef, type SparkleTier } from "./sparkle-catalog";
import { IS_PIANO } from "./flavor";
import { totalSeconds } from "./menu-store";

const KEY = "karate.sparkles";

/// このアプリ（空手／ピアノ）の キラキラ を、開く順に。
export const MY_SPARKLES: SparkleDef[] = SPARKLES.filter(
  (s) => s.mode === (IS_PIANO ? "piano" : "karate"),
);

export function sparkleById(id: string): SparkleDef | undefined {
  return MY_SPARKLES.find((s) => s.id === id);
}

function startIds(): string[] {
  return MY_SPARKLES.filter((s) => s.tier === "start").map((s) => s.id);
}

/// 持っているキラキラの id。最初から持っているものは必ず入る（保存に何も
/// 書かれていなくても、カタログに start を足した日から使える）。
export function loadUnlocked(storage: Storage = localStorage): string[] {
  let saved: string[] = [];
  try {
    const raw = storage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) saved = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    /* 読めなければ「最初の分だけ持っている」で続ける */
  }
  const have = new Set([...startIds(), ...saved]);
  // カタログから消えた id は落とす。並びはカタログ順（画面もこの順に出す）。
  return MY_SPARKLES.filter((s) => have.has(s.id)).map((s) => s.id);
}

export function isUnlocked(id: string, storage: Storage = localStorage): boolean {
  return loadUnlocked(storage).includes(id);
}

function save(ids: string[], storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore storage errors */
  }
}

/// その稽古が どの段まで届いたか。届いていなければ null。
export interface PracticeShape {
  /// 最後まで行った（途中で「終了」していない）
  completed: boolean;
  /// メニューの 種目（休憩ではない行）を ぜんぶ やり切った
  allDrillsDone: boolean;
  menu: Menu;
}

export const SHORT_SECONDS = 180;
export const LONG_SECONDS = 300;

/// メニューに休憩の行が1つでもあるか。
export function hasRest(menu: Menu): boolean {
  return menu.some((d) => d.kind === "rest");
}

/// その稽古で ねらえる段。やり切っていなければ null。
export function tierEarned(p: PracticeShape): SparkleTier | null {
  if (!p.completed || !p.allDrillsDone) return null;
  const seconds = totalSeconds(p.menu);
  if (!hasRest(p.menu) && seconds >= LONG_SECONDS) return "long";
  if (seconds >= SHORT_SECONDS) return "short";
  return null;
}

/// まだ持っていない、その段のいちばん最初の1つ。
function nextLocked(tier: SparkleTier, unlocked: Set<string>): SparkleDef | undefined {
  return MY_SPARKLES.find((s) => s.tier === tier && !unlocked.has(s.id));
}

export interface SparkleAward {
  /// 開いたキラキラ。何も開かなければ null。
  unlocked: SparkleDef | null;
  /// この稽古が届いた段（何も開かなくても、届いていれば入る）。
  tier: SparkleTier | null;
  /// この段のキラキラは もう全部持っている。
  alreadyComplete: boolean;
}

/// 稽古1回ぶんを記録して、開いたキラキラを返す。**開くのは多くても1つ。**
export function awardForPractice(p: PracticeShape, storage: Storage = localStorage): SparkleAward {
  const tier = tierEarned(p);
  if (!tier) return { unlocked: null, tier: null, alreadyComplete: false };
  const ids = loadUnlocked(storage);
  const have = new Set(ids);
  // long を満たした稽古は short も満たしている。強いほうから開ける。
  const order: SparkleTier[] = tier === "long" ? ["long", "short"] : ["short"];
  for (const t of order) {
    const found = nextLocked(t, have);
    if (found) {
      save([...ids, found.id], storage);
      return { unlocked: found, tier, alreadyComplete: false };
    }
  }
  return { unlocked: null, tier, alreadyComplete: true };
}

/// つぎに開くもの（画面のヒント用）。両方の段の「つぎの1つ」を返す。
export function nextToUnlock(storage: Storage = localStorage): { short?: SparkleDef; long?: SparkleDef } {
  const have = new Set(loadUnlocked(storage));
  return { short: nextLocked("short", have), long: nextLocked("long", have) };
}

/// test アプリ（家族 → テスト用）だけ: 持っているキラキラを直接書き換える。
export function setUnlocked(ids: string[], storage: Storage = localStorage): void {
  save(MY_SPARKLES.filter((s) => ids.includes(s.id)).map((s) => s.id), storage);
}
