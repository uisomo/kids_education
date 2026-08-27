import { renderParentalGate } from "../parental-gate";
import type { GateChallenge } from "../parental-gate";

export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(): void;
  onAgain(): void;
  gateChallenge?: GateChallenge;
}

export function renderDoneScreen(root: HTMLElement, deps: DoneDeps): void {
  root.textContent = "";
  root.className = "screen done";

  const video = document.createElement("video");
  video.setAttribute("src", deps.videoUrl);
  video.setAttribute("playsinline", "");
  video.controls = true;

  const stats = document.createElement("div");
  stats.className = "stats";
  const stat = (v: string | number, k: string) => {
    const el = document.createElement("div"); el.className = "stat";
    el.innerHTML = `<div class="v"></div><div class="k"></div>`;
    el.querySelector(".v")!.textContent = String(v);
    el.querySelector(".k")!.textContent = k;
    return el;
  };
  stats.append(stat(deps.stats.time, "時間"), stat(deps.stats.drills, "種目"), stat(deps.stats.cues, "掛け声"));

  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  dl.textContent = `⬇ 動画を保存 (.${deps.ext})`;
  dl.addEventListener("click", () => {
    // 共有の前に保護者ゲート。通過で onShare、キャンセルで done 画面へ戻す。
    renderParentalGate(root, {
      challenge: deps.gateChallenge,
      onPass: () => deps.onShare(),
      onCancel: () => renderDoneScreen(root, deps),
    });
  });

  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する";
  again.addEventListener("click", () => deps.onAgain());

  root.append(video, stats, dl, again);
}
