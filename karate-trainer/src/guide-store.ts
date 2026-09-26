// 初回ガイド「10秒いっしょに録る」の進み具合。インストールした人が覚えることは
// 実質 ①メニューをえらぶ ②開始 ③保存 の3つだけなので、使い方どうが（あとから
// 調べる人むけ）ではなく、10秒だけ本当に録って保存まで一緒にやってしまう。
//
// 端末に一度やれば十分なので、メンバーごとではなく家族共有の base ストレージに
// 置く。「あとで」を選んだときは done にせず数だけ数え、しつこくない回数
// (MAX_SKIPS) までは次の起動でもう一度さそう。

import { hasSavedVideo } from "./saved-video-store";

const KEY = "karate.guide";

// 「あとで」がこの回数たまったら、もうカードは出さない（家族→テスト用から
// やり直せる）。
export const MAX_SKIPS = 3;

export interface GuideState {
  // 最後まで（保存まで）やった、または もう出さないと決めた。
  done: boolean;
  // 「あとで」を押した回数。
  skips: number;
}

const EMPTY: GuideState = { done: false, skips: 0 };

export function getGuide(storage: Storage = localStorage): GuideState {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<GuideState>;
    return {
      done: v.done === true,
      skips: typeof v.skips === "number" && v.skips > 0 ? Math.floor(v.skips) : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(value: GuideState, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

// 今日の稽古の画面に「10びょうで やってみる？」カードを出すか。
// **一度でも動画を保存した人には もう出さない** — 保存までできた人に
// 「作ってみよう」と言うのは、やりかたを知っている人への声かけになってしまう。
export function shouldOfferGuide(storage: Storage = localStorage): boolean {
  if (hasSavedVideo(storage)) return false;
  const g = getGuide(storage);
  return !g.done && g.skips < MAX_SKIPS;
}

export function markGuideDone(storage: Storage = localStorage): void {
  save({ ...getGuide(storage), done: true }, storage);
}

export function markGuideSkipped(storage: Storage = localStorage): void {
  const g = getGuide(storage);
  save({ ...g, skips: g.skips + 1 }, storage);
}

// 家族 → テスト用「初回ガイドをやり直す」。
export function resetGuide(storage: Storage = localStorage): void {
  save({ ...EMPTY }, storage);
}
