import { WakeGuard } from "./wake-lock";
import type { WakeGuardLike } from "./app";
import { COPY } from "./flavor";

export interface PlatformDeps {
  isNative?: () => boolean;
}

// 実機判定。テストでは deps.isNative を注入するのでここは呼ばれない。
async function detectNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function makeWakeGuard(deps: PlatformDeps = {}): WakeGuardLike {
  const isNative = deps.isNative;
  if (isNative ? isNative() : false) {
    // ネイティブ: keep-awake プラグイン。プラグインは実機でのみ読み込む。
    return {
      async acquire() {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        try { await KeepAwake.keepAwake(); } catch { /* ignore */ }
      },
      async release() {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        try { await KeepAwake.allowSleep(); } catch { /* ignore */ }
      },
    };
  }
  // Web: 既存の WakeGuard（jsdom / 非対応環境では no-op）
  return new WakeGuard();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export async function shareRecording(
  blob: Blob,
  ext: string,
  fileUri?: string | null,
  deps: PlatformDeps = {},
): Promise<void> {
  const isNative = deps.isNative;
  const native = isNative ? isNative() : await detectNative();

  // The native recorder already wrote the finished video to disk, so hand the
  // share sheet that path. Going through blobToBase64() instead would hold the
  // whole video in memory twice as a JS string — minutes of 1080p is enough to
  // get the app killed.
  if (native && fileUri) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: COPY.appName, url: fileUri });
    return;
  }

  if (native) {
    // ネイティブ: 一時ファイルに書き出し → OS シェアシート。
    // 保存先（写真/ファイル/AirDrop 等）はユーザーがシートで選ぶ。
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: COPY.appName, url: await writeCacheFile(blob, ext) });
    return;
  }

  // Web: 既存の <a download>
  downloadBlob(blob, ext);
}

// 「⬇ 動画を保存」: keeps the video on this phone — straight into the 写真
// library on native, a plain download in the browser. It never opens the share
// sheet, so nothing can leave the device and no parental gate is needed; that
// gate belongs to 「LINE・SNSで送る」, which a parent turns on in the 家族 tab.
export async function saveRecording(
  blob: Blob,
  ext: string,
  fileUri?: string | null,
  deps: PlatformDeps = {},
): Promise<void> {
  const isNative = deps.isNative;
  const native = isNative ? isNative() : await detectNative();

  if (native) {
    const { saveVideoToPhotos } = await import("./native-recorder");
    // The native recorder already wrote the finished video to disk; without
    // that path (web recorder fallback) put the blob in the cache first, so
    // 保存 still means 保存 rather than falling back to the share sheet.
    const uri = fileUri || (await writeCacheFile(blob, ext));
    if (await saveVideoToPhotos(uri, { isNative: true })) return;
  }

  downloadBlob(blob, ext);
}

// Writes the blob into the app's cache directory and returns its file:// URI.
async function writeCacheFile(blob: Blob, ext: string): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const written = await Filesystem.writeFile({
    path: `karate-training.${ext}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  return written.uri;
}

function downloadBlob(blob: Blob, ext: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `karate-training.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
