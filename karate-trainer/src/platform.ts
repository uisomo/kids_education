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
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const fileName = `karate-training.${ext}`;
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Cache,
    });
    await Share.share({ title: COPY.appName, url: written.uri });
    return;
  }

  // Web: 既存の <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `karate-training.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
