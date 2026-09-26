// 一度でも 動画を保存したことがあるか。端末ごとに一つ（家族で共有する base
// ストレージ）で、だれが保存したかは数えない。
//
// これで出しわけるものが2つある:
//   ・「10びょうで やってみる？」の さそい … **まだ保存したことがない人だけ**
//     （保存までやった人は、もう やりかたを知っている）
//   ・★ レビュー依頼（Apple の星のシート） … **保存したことがある人だけ**
//     保存までやって「これはいい」と思えた人にしか、星は聞かない。

const KEY = "karate.videoSaved";

/// これまでに動画を保存した回数（数えられないときは 0）。
export function savedVideoCount(storage: Storage = localStorage): number {
  try {
    const n = Number.parseInt(storage.getItem(KEY) ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function hasSavedVideo(storage: Storage = localStorage): boolean {
  return savedVideoCount(storage) > 0;
}

/// 保存がうまくいったときに呼ぶ（写真ライブラリ／ブラウザのダウンロード）。
export function markVideoSaved(storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, String(savedVideoCount(storage) + 1));
  } catch {
    /* ignore storage errors */
  }
}

/// test アプリ（家族 → テスト用）や初回ガイドのやり直し用。
export function resetSavedVideos(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore storage errors */
  }
}
