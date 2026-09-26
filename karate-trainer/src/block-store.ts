// 🧊 ブロックを あつめる。持っているかどうかは **稽古した回数だけ** で決まる
// （持ちものの一覧は保存しない。回数から毎回 数えなおす）。
//
// なぜ回数だけにするか: 一覧と回数の2つを保存すると、かならずどちらかが
// ずれる。回数は増えるだけなので、絵を足しても 持っていたものは消えない。
//
// 何を「1回の稽古」と数えるか: **最後まで行って、種目を1つ以上やり切った稽古**
// （🔥 の連続日数と同じ数えかた）。とちゅうで終わった稽古は数えない。

import { BLOCKS, type BlockDef } from "./block-catalog";

const KEY = "karate.blockPractices";

function read(storage: Storage): number {
  try {
    const raw = storage.getItem(KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function write(n: number, storage: Storage): void {
  try {
    storage.setItem(KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore storage errors */
  }
}

/// これまでに数えた稽古の回数。
export function practiceCount(storage: Storage = localStorage): number {
  return read(storage);
}

/// 持っているブロック（カタログの順）。
export function unlockedBlocks(storage: Storage = localStorage): BlockDef[] {
  const n = read(storage);
  return BLOCKS.filter((b) => b.at <= n);
}

export function isBlockUnlocked(id: string, storage: Storage = localStorage): boolean {
  return unlockedBlocks(storage).some((b) => b.id === id);
}

/// つぎに開くブロックと、あと何回で開くか。ぜんぶ持っていれば null。
export function nextBlock(storage: Storage = localStorage): { block: BlockDef; remaining: number } | null {
  const n = read(storage);
  const block = BLOCKS.find((b) => b.at > n);
  return block ? { block, remaining: block.at - n } : null;
}

export interface BlockAward {
  /// 数えたあとの回数。
  count: number;
  /// この稽古で開いたブロック。開かなければ null。**多くても1つ。**
  unlocked: BlockDef | null;
}

/// 稽古1回ぶんを数えて、開いたブロックを返す。
export function recordPracticeForBlocks(storage: Storage = localStorage): BlockAward {
  const before = read(storage);
  const count = before + 1;
  write(count, storage);
  // しきい値は1つずつ離れているので、1回で2つ開くことはない。
  const unlocked = BLOCKS.find((b) => b.at > before && b.at <= count) ?? null;
  return { count, unlocked };
}

/// test アプリ（家族 → テスト用）だけ: 回数を直接書き換える。
export function setPracticeCount(n: number, storage: Storage = localStorage): void {
  write(n, storage);
}
