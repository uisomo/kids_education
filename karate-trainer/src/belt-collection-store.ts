// 帯のコレクション — その人が これまでに **もらった帯を、もらった順に** 全部。
//
// 帯そのものは メニューごと（menu-belt-store）なので、メニューを消すと その帯は
// 消える。集めたものが消えるのは かなしいので、**もらった帯はここに残す。**
// メニューが3つあれば 白帯も3回もらえる（同じ帯が並ぶ）。数が増えていくのが
// うれしいところなので、重なりは わざと消さない。
//
// **同じ色の帯が 5本** たまるごとに、**その色のトロフィーが1つ**（白帯5本で
// 白のトロフィー）。だから帯の棚には、色ごとに何本持っているかの数を出す。
// 名前に「空手」とは書かない —— ピアノのアプリでも同じものがもらえるし、
// 外に見せるものに種目を書く必要はない。
//
// 前の決まりは「色に関係なく 10本ごとに1つ」だった。トロフィーは まだ
// 外に出していない（テスト機だけ）ので、引きつぎは考えない。

import { BELTS } from "./belt-store";

const KEY = "karate.beltsEarned";
/// 旧: 「いちばん上まで行った帯の番号」だけを持っていたころのもの。
/// 読むだけ（白からその帯までは通ってきた、と考えて数に直す）。
const OLD_KEY = "karate.beltsCollected";
const LAST = BELTS.length - 1;
/// 同じ色を何本あつめたら トロフィー1つか。
export const BELTS_PER_TROPHY = 5;
/// 保存する上限。毎日1本もらっても数年ぶん。ここに当たるほど集めた人は、
/// それ以上数えなくても こまらない。
const MAX_KEPT = 400;

const clamp = (i: number): number => Math.min(LAST, Math.max(0, Math.floor(i)));

function readList(storage: Storage): number[] | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).map(clamp);
  } catch {
    return null;
  }
}

function write(list: number[], storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(list.slice(-MAX_KEPT)));
  } catch {
    /* ignore storage errors */
  }
}

/// 旧データ（いちばん上の番号）を「白からそこまで」の並びに直す。
function fromOldKey(storage: Storage): number[] | null {
  try {
    const raw = storage.getItem(OLD_KEY);
    if (raw === null) return null;
    const top = Number.parseInt(raw, 10);
    if (!Number.isFinite(top) || top < 0) return null;
    return Array.from({ length: clamp(top) + 1 }, (_, i) => i);
  } catch {
    return null;
  }
}

/// もらった帯を、もらった順に。
export function loadEarnedBelts(storage: Storage = localStorage): number[] {
  return readList(storage) ?? fromOldKey(storage) ?? [];
}

/// 何本もらったか。
export function beltCount(storage: Storage = localStorage): number {
  return loadEarnedBelts(storage).length;
}

/// 帯を1本もらう（メニューの帯が1つ上がったとき）。合計を返す。
export function earnBelt(index: number, storage: Storage = localStorage): number {
  const list = [...loadEarnedBelts(storage), clamp(index)];
  write(list, storage);
  return list.length;
}

/// 新しい数えかたに切り替わる前から使っている人を、いちどだけ拾う。
/// 旧データ（いちばん上の番号）と、いま持っているメニューの帯の高いほうから
/// 「白からそこまで」を作る。**すでに新しい形で保存があれば何もしない**
/// （ここで足すと、開くたびに帯が増えてしまう）。
export function seedBeltCollection(beltIndexes: number[], storage: Storage = localStorage): number[] {
  const existing = readList(storage);
  if (existing) return existing;
  const fromOld = fromOldKey(storage) ?? [];
  const top = beltIndexes.reduce((max, i) => Math.max(max, Math.floor(i)), fromOld.length - 1);
  const list = top >= 0 ? Array.from({ length: clamp(top) + 1 }, (_, i) => i) : [];
  write(list, storage);
  return list;
}

export interface TrophyDef {
  /// どの色（BELTS の番号）の トロフィーか。
  index: number;
  /// その色で 何個めか（1から）。同じ色を 10本あつめれば 2つ並ぶ。
  number: number;
  /// 見せる名前（「しろの トロフィー」など）。種目の名前は入れない。
  name: string;
  /// 帯と同じ塗り。
  fill: string;
  ink: string;
}

/// 帯の名前から「帯」「音符」を落として、色の名前だけにする。
function colourName(index: number): string {
  return BELTS[index].name.replace(/の?(帯|音符)$/, "");
}

export function trophyAt(index: number, number = 1): TrophyDef {
  const i = clamp(index);
  const belt = BELTS[i];
  return {
    index: i,
    number: Math.max(1, Math.floor(number)),
    name: `${colourName(i)}の トロフィー`,
    fill: belt.fill,
    ink: belt.ink,
  };
}

/// 色ごとの トロフィーの数（帯の並び順）。
export function trophyCounts(storage: Storage = localStorage): number[] {
  return beltCollection(storage).map((b) => Math.floor(b.count / BELTS_PER_TROPHY));
}

/// いま持っているトロフィー。色の順に、同じ色は 1つめ→2つめ の順で並ぶ。
export function trophies(storage: Storage = localStorage): TrophyDef[] {
  const out: TrophyDef[] = [];
  trophyCounts(storage).forEach((n, index) => {
    for (let i = 1; i <= n; i++) out.push(trophyAt(index, i));
  });
  return out;
}

/// 帯を1本もらう前と後の トロフィーを見て、**増えた1つ**を返す（無ければ null）。
/// 色ごとに増えるので「後ろに足されたもの」では見つけられない。
export function gainedTrophy(before: TrophyDef[], after: TrophyDef[]): TrophyDef | null {
  if (after.length <= before.length) return null;
  const tally = (list: TrophyDef[]): Map<number, number> => list.reduce(
    (m, t) => m.set(t.index, (m.get(t.index) ?? 0) + 1), new Map<number, number>(),
  );
  const had = tally(before);
  for (const [index, n] of tally(after)) {
    if (n > (had.get(index) ?? 0)) return trophyAt(index, n);
  }
  return null;
}

/// その色の トロフィーまで あと何本か（5本ちょうどなら、次の1つまでの 5本）。
export function beltsToNextTrophyFor(index: number, storage: Storage = localStorage): number {
  const count = beltCollection(storage)[clamp(index)].count;
  return BELTS_PER_TROPHY - (count % BELTS_PER_TROPHY);
}

/// どれか1色でも トロフィーに いちばん近い色の、あと何本か。
export function beltsToNextTrophy(storage: Storage = localStorage): number {
  return beltCollection(storage).reduce(
    (best, b) => Math.min(best, BELTS_PER_TROPHY - (b.count % BELTS_PER_TROPHY)),
    BELTS_PER_TROPHY,
  );
}

/// 帯ごとに、何本持っているか（画面のコレクション用）。
export function beltCollection(storage: Storage = localStorage): { index: number; count: number }[] {
  const list = loadEarnedBelts(storage);
  return BELTS.map((_, index) => ({ index, count: list.filter((i) => i === index).length }));
}

/// test アプリ（家族 → テスト用）だけ: 持っている帯を直接書き換える。
export function setEarnedBelts(list: number[], storage: Storage = localStorage): void {
  write(list.map(clamp), storage);
}
