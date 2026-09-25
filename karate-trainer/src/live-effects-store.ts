// 稽古中に **画面にだけ** 出すキラキラ。家族タブで親が選ぶ、家じゅう共通の
// 設定（かざりと同じ置き場所）。空文字は「出さない」で、それが既定。
//
// だいじな区別:
//   ここで選んだものは **保存される動画には入らない**。録画は AVFoundation が
//   カメラの絵をそのまま書いているので、画面に重ねたものは入りようがない。
//   保存動画のキラキラは、稽古のあとに done 画面でつける別の機能。
//   同じ動画を別々に解析するので、見えていたものと保存されたものは
//   ぴったり同じにはならない。
//
// 既定がオフなのは、稽古中に Vision を回すぶんカメラと電池を使うから。
// 親が一度えらんだら、次の稽古から出る（稽古の途中では変わらない）。

const KEY = "karate.liveEffects";

/// 選ばれているかざりの id、または "" （出さない）。
export function loadLiveEffect(storage: Storage = localStorage): string {
  try {
    return storage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLiveEffect(presetId: string, storage: Storage = localStorage): void {
  try {
    if (presetId) storage.setItem(KEY, presetId);
    else storage.removeItem(KEY);
  } catch {
    /* ignore storage errors */
  }
}
