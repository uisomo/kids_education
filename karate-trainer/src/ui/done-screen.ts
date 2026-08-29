import { renderParentalGate } from "../parental-gate";
import type { GateChallenge } from "../parental-gate";
import { CHARACTERS, type CharacterId } from "../character-store";
import { createCompanionAvatar } from "./companion-avatar";

export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(): void;
  onAgain(): void;
  gateChallenge?: GateChallenge;
  characterId?: CharacterId;
  xpEarned?: number;
}

export function renderDoneScreen(root: HTMLElement, deps: DoneDeps): void {
  root.textContent = "";
  root.className = "screen done";

  const companionId = deps.characterId ?? "alan";
  const companionInfo = CHARACTERS[companionId] ?? CHARACTERS.alan;
  const companionAvatar = createCompanionAvatar(companionId, "cheer", "medium");

  // Celebration Card
  const celebCard = document.createElement("div");
  celebCard.className = "done-celebration-card";

  const trophyImg = document.createElement("img");
  trophyImg.className = "done-trophy-img";
  trophyImg.src = "/badges/victory_trophy.jpg";
  trophyImg.alt = "優勝トロフィー";

  const stars = document.createElement("div");
  stars.className = "done-stars";
  stars.textContent = "⭐⭐⭐";

  const title = document.createElement("h2");
  title.className = "done-title";
  title.textContent = "稽古完了！よく頑張ったね！";

  const praise = document.createElement("p");
  praise.style.cssText = "margin: 0; color: #ffd166; font-weight: 800; font-size: 1.05rem;";
  praise.textContent = `${companionInfo.name}: 「${companionInfo.quotes[0]}」 (+${deps.xpEarned ?? 50} XP)`;

  celebCard.append(trophyImg, companionAvatar.element, stars, title, praise);

  // Video Replay
  const video = document.createElement("video");
  video.setAttribute("src", deps.videoUrl);
  video.setAttribute("playsinline", "");
  video.controls = true;

  // Stats Breakdown
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

  // Save / Share Button with Parental Gate
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
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する 🥋";
  again.addEventListener("click", () => deps.onAgain());

  root.append(celebCard, video, stats, dl, again);
}
