// 帯のコレクション — その人が これまでに **もらった帯を、もらった順に** 全部。
//
// 帯そのものは メニューごと（menu-belt-store）なので、メニューを消すと その帯は
// 消える。集めたものが消えるのは かなしいので、**もらった帯はここに残す。**
// メニューが3つあれば 白帯も3回もらえる（同じ帯が並ぶ）。数が増えていくのが
// うれしいところなので、重なりは わざと消さない。
//
// 帯が 10本 たまるごとに **トロフィーが1つ**。色は帯の並びから順に取る
// （1つめは白、2つめは黄…）。名前に「空手」とは書かない —— ピアノのアプリでも
// 同じものがもらえるし、外に見せるものに種目を書く必要はない。

import { BELTS } from "./belt-store";

const KEY = "karate.beltsEarned";
/// 旧: 「いちばん上まで行った帯の番号」だけを持っていたころのもの。
/// 読むだけ（白からその帯までは通ってきた、と考えて数に直す）。
const OLD_KEY = "karate.beltsCollected";
const LAST = BELTS.length - 1;
export const BELTS_PER_TROPHY = 10;
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
  /// 何個めのトロフィーか（1から）。
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

export function trophyAt(number: number): TrophyDef {
  const belt = BELTS[(number - 1) % BELTS.length];
  return {
    number,
    name: `${colourName((number - 1) % BELTS.length)}の トロフィー`,
    fill: belt.fill,
    ink: belt.ink,
  };
}

/// いま持っているトロフィー。
export function trophies(storage: Storage = localStorage): TrophyDef[] {
  const count = Math.floor(beltCount(storage) / BELTS_PER_TROPHY);
  return Array.from({ length: count }, (_, i) => trophyAt(i + 1));
}

/// つぎのトロフィーまで あと何本の帯か。
export function beltsToNextTrophy(storage: Storage = localStorage): number {
  return BELTS_PER_TROPHY - (beltCount(storage) % BELTS_PER_TROPHY);
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
