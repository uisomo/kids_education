// 帯のコレクション — その人が これまでに 手にした帯。
//
// 帯そのものは メニューごと（menu-belt-store）なので、メニューを消すと その帯も
// 消える。集めたものが消えるのは かなしいので、**見かけた帯はここに残す。**
// 保存しているのは「いちばん上まで行った番号」だけ: 白から その帯までは
// 通ってきた、と考える（帯は1つずつしか上がらない）。

import { BELTS } from "./belt-store";

const KEY = "karate.beltsCollected";
const LAST = BELTS.length - 1;

function read(storage: Storage): number {
  try {
    const raw = storage.getItem(KEY);
    const n = raw === null ? -1 : Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.min(LAST, Math.max(-1, n)) : -1;
  } catch {
    return -1;
  }
}

/// いま持っているメニューの帯を見て、コレクションを追いつかせる。下がらない。
/// 返すのは「ここまで集めた」帯の番号（まだ1つも無ければ -1）。
export function syncBeltCollection(beltIndexes: number[], storage: Storage = localStorage): number {
  const highest = beltIndexes.reduce((max, i) => Math.max(max, Math.floor(i)), read(storage));
  const clamped = Math.min(LAST, Math.max(-1, highest));
  if (clamped > read(storage)) {
    try {
      storage.setItem(KEY, String(clamped));
    } catch {
      /* ignore storage errors */
    }
  }
  return clamped;
}

/// 集めた帯の番号（いちばん上）。画面はこれ以下を「持っている」として描く。
export function loadBeltCollection(storage: Storage = localStorage): number {
  return read(storage);
}

/// 帯ごとに、持っているかどうか。
export function beltCollection(storage: Storage = localStorage): { index: number; owned: boolean }[] {
  const top = read(storage);
  return BELTS.map((_, index) => ({ index, owned: index <= top }));
}
