// 練習BGM は「イヤフォンをつけているときだけ流す」。
//
// スピーカーから音楽が鳴ると、道場や家のまわりの人の邪魔になるし、マイクにも
// 入って動画に二重で乗る。だから出口を見て、イヤフォン（有線・Bluetooth・USB）
// でなければ 鳴らさない。
//
// 仕組みは「もう一枚 muted をかぶせる」だけ。子どもが選んだ BGM on/off
// （bgm-store の karate.bgmMuted）はそのまま残り、イヤフォンを抜いたあいだは
// それに関係なく止まる。さし直せば、子どもの選んだとおりに戻る。
//
// 稽古のとちゅうで抜いてもその場で止まる（"audioRouteChanged"）。

import type { BgmPlayer } from "./app";

export interface HeadphoneWatcher {
  /// いまイヤフォンかどうか。分からないとき（ブラウザ）は false を返す。
  connected(): boolean;
  /// さした/抜いたときに呼ばれる。返り値は購読をやめる関数。
  onChange(cb: (connected: boolean) => void): () => void;
}

/// イヤフォンでなければ鳴らないようにした BgmPlayer を返す。
///
/// `isMuted()` は「いま鳴らないかどうか」を返す（子どもの設定 **または**
/// イヤフォンが無い）。画面のボタンはこれを見ているので、イヤフォンを抜けば
/// 🔇 になる。どちらの理由で止まっているかは `mutedByHeadphones()` で分かる。
export interface GatedBgmPlayer extends BgmPlayer {
  mutedByHeadphones(): boolean;
  /// イヤフォンの有無だけで鳴る/鳴らないが変わったときに呼ばれる。
  /// 子どもがボタンを押したときは呼ばれない（押した側で記録しているから）。
  /// 画面のモニター状態だけを更新する。書き出し用の選択設定は変えない。
  onHeadphoneChange(cb: (audible: boolean) => void): () => void;
}

export function withHeadphoneGate(
  player: BgmPlayer,
  watcher: HeadphoneWatcher,
): GatedBgmPlayer {
  // 子どもが選んだ状態。イヤフォンの有無でこれを書き換えてはいけない。
  let chosenMuted = player.isMuted();
  let connected = watcher.connected();

  const gateListeners = new Set<(audible: boolean) => void>();

  // 中の player には「選んだ状態」と「イヤフォン」の両方を掛けたものを渡す。
  const apply = () => player.setMuted(chosenMuted || !connected);

  watcher.onChange((next) => {
    if (next === connected) return;
    connected = next;
    apply();
    // 子どもが「切」にしているなら、さしても抜いても 鳴らないままなので黙っておく。
    if (!chosenMuted) gateListeners.forEach((cb) => cb(next));
  });
  apply();

  return {
    get src() {
      return player.src;
    },
    unlock() {
      player.unlock();
    },
    play() {
      // 稽古が始まるたびに読み直す: 前の稽古のあいだに さしたり抜いたりしていても、
      // イベントを取りこぼしていても、ここで正しくなる。
      connected = watcher.connected();
      apply();
      player.play();
    },
    stop() {
      player.stop();
    },
    setMuted(muted: boolean) {
      chosenMuted = muted;
      apply();
    },
    isMuted() {
      return chosenMuted || !connected;
    },
    mutedByHeadphones() {
      return !connected && !chosenMuted;
    },
    onHeadphoneChange(cb) {
      gateListeners.add(cb);
      return () => gateListeners.delete(cb);
    },
  };
}

/// 出口を確認できないブラウザではBGMを停止する。
export const unknownOutputRoute: HeadphoneWatcher = {
  connected: () => false,
  onChange: () => () => { /* 変わらない */ },
};
