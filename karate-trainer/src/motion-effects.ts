// ✨キラキラ — 仕上がった練習動画に、動きに合わせた細い輪郭のかざりを乗せた
// *別ファイル* を作る。元の動画はそのまま残るので、いつでも「もとの動画」に
// 戻せる。中身は ios/App/App/PracticeMotionFX/（Vision でポーズを見て、
// AVFoundation で書き出す）。
//
// なぜ録画中ではなく、あとから付けるのか:
//   録画は AVCaptureMovieFileOutput が書いていて、画面に重ねたものは録画には
//   入らない。録画に手を入れると、いちばん大事な「子どもの練習が残る」が
//   こわれる。だから録画には一切さわらず、保存が終わった動画を読んで作る。
//
// ぜんぶ端末の中で動く（通信・アップロード・課金・外部サービスは無し）。
// iOS 17 より前の iPhone では available=false になり、ボタン自体を出さない。
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { karateRecorderPlugin, type KarateRecorderPluginLike } from "./native-recorder";
import { IS_PIANO } from "./flavor";

// 空手は体（手首・足首）、ピアノは手のひらを見る。アプリごとに固定で、
// 動画の中身から当てたりはしない。
export type MotionMode = "karate" | "piano";
export const MOTION_MODE: MotionMode = IS_PIANO ? "piano" : "karate";

export interface MotionPreset {
  id: string;
  // 子どもが読める短い名前（「⚡️ いなずま」など）。ネイティブ側が持っている。
  name: string;
}

export type MotionPhase = "analyzing" | "exporting";

export interface MotionDeps {
  plugin?: KarateRecorderPluginLike;
  isNative?: boolean;
}

function resolve(deps: MotionDeps): { plugin: KarateRecorderPluginLike; isNative: boolean } | null {
  const isNative = deps.isNative ?? Capacitor.isNativePlatform();
  if (!isNative) return null;
  return { plugin: deps.plugin ?? karateRecorderPlugin(), isNative };
}

// 一度きいた結果は覚えておく: 家族タブは同期的に描くので、そこからは
// cachedMotionPresets() を読む。
let cached: MotionPreset[] | null = null;

/// いちど motionEffectPresets() が返っていれば、その一覧。まだなら空。
export function cachedMotionPresets(): MotionPreset[] {
  return cached ?? [];
}

/// 一度でも聞いたか。まだなら家族タブが聞きに行って、返ったら描き直す。
/// （使えない iPhone では空のまま覚えるので、何度も聞きに行かない。）
export function motionPresetsAsked(): boolean {
  return cached !== null;
}

// この iPhone で使えるかざり。使えないとき（ウェブ、古い iOS、古いネイティブ
// ビルド）は空配列で、呼び出し側はボタンを出さない。never rejects.
export async function motionEffectPresets(deps: MotionDeps = {}): Promise<MotionPreset[]> {
  const found = resolve(deps);
  if (!found) { cached = []; return []; }
  try {
    if (typeof found.plugin.motionEffectsInfo !== "function") { cached = []; return []; }
    const info = await found.plugin.motionEffectsInfo({ mode: MOTION_MODE });
    if (!info?.available || !Array.isArray(info.presets)) { cached = []; return []; }
    cached = info.presets.filter(
      (p): p is MotionPreset => typeof p?.id === "string" && typeof p?.name === "string",
    );
    return cached;
  } catch (e) {
    console.warn("motionEffectPresets failed", e);
    cached = [];
    return [];
  }
}

// 進み具合はプラグインのイベントで来る。購読はページで 1 回だけ（何度も
// addListener すると、1 回の書き出しで同じ進捗が何重にも届く）。
let progressSub: Promise<PluginListenerHandle | undefined> | null = null;
let currentProgress: ((phase: MotionPhase, fraction: number) => void) | null = null;

function listenForProgress(plugin: KarateRecorderPluginLike): Promise<unknown> {
  return (progressSub ??= Promise.resolve()
    .then(() => plugin.addListener?.("motionEffectsProgress", (data) => {
      const phase = data?.phase === "exporting" ? "exporting" : "analyzing";
      const fraction = Math.min(1, Math.max(0, Number(data?.progress) || 0));
      currentProgress?.(phase, fraction);
    }))
    .catch((e: unknown) => {
      console.warn("motion effects progress listener failed", e);
      return undefined;
    }));
}

// かざりを付けた動画を作って、そのファイル URI を返す。
// 元の `uri` は読むだけで、書き換えない。
// 途中で cancelMotionEffects() されたら "cancelled" で reject する。
export async function applyMotionEffects(
  opts: { uri: string; preset: string; intensity?: number },
  onProgress?: (phase: MotionPhase, fraction: number) => void,
  deps: MotionDeps = {},
): Promise<string> {
  const found = resolve(deps);
  if (!found || typeof found.plugin.applyMotionEffects !== "function") {
    throw new Error("motion effects unavailable");
  }
  await listenForProgress(found.plugin);
  currentProgress = onProgress ?? null;
  try {
    const result = await found.plugin.applyMotionEffects({
      uri: opts.uri,
      mode: MOTION_MODE,
      preset: opts.preset,
      intensity: opts.intensity ?? 1,
    });
    if (!result?.uri) throw new Error("motion effects produced no file");
    return result.uri;
  } finally {
    currentProgress = null;
  }
}

// 「やめる」。書きかけのファイルはネイティブ側が消す。never rejects.
export async function cancelMotionEffects(deps: MotionDeps = {}): Promise<void> {
  const found = resolve(deps);
  if (!found) return;
  try {
    await found.plugin.cancelMotionEffects?.();
  } catch (e) {
    console.warn("cancelMotionEffects failed", e);
  }
}

// <video src> に入れられる URL。
export function motionPlaybackUrl(uri: string): string {
  return Capacitor.convertFileSrc(uri);
}
