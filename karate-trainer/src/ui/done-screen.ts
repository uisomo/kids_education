import { CHARACTERS, type CharacterId } from "../character-store";
import { createCompanionAvatar } from "./companion-avatar";

export interface DoneKufuDrill {
  name: string;
  current: string;   // latest saved 工夫 for this drill (may be "")
  // false when the plan's maxKufuDrills cap is already used by another 種目
  // (Free plan: 1 種目 total) — the input/save button are disabled, not hidden.
  canAdd?: boolean;
}

export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(blob?: Blob): void;
  onAgain(): void;
  characterId?: CharacterId;
  xpEarned?: number;
  // 工夫: drills practiced this session (deduped, rest excluded) + save callback.
  kufuDrills?: DoneKufuDrill[];
  onSaveKufu?(drillName: string, text: string): void;
  // When false (Free plan, 工夫 cap 0) the 工夫 section is not rendered at all.
  kufuEnabled?: boolean;
  // Resolves to the burned-in video blob, or null if burn-in failed/was
  // skipped — in which case the raw videoUrl remains the final result.
  burnInPromise?: Promise<Blob | null>;
  // Temporary on-device diagnostics (track mute/ended events, tab visibility
  // changes, rAF stalls) for tracking down the iPhone Safari video-freeze
  // bug. Shown collapsed since it's only useful for debugging. Omitted
  // (undefined/empty) when nothing was logged.
  diagnosticsText?: string;
}

const KUFU_MAX_LEN = 15;

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

  let shareBlob: Blob | undefined;

  const burninStatus = document.createElement("div");
  burninStatus.dataset.burninStatus = "";
  burninStatus.className = "burnin-status";
  burninStatus.textContent = "動画を仕上げています…";
  const showBurninStatus = !!deps.burnInPromise;

  if (deps.burnInPromise) {
    void deps.burnInPromise.then((burnedBlob) => {
      burninStatus.remove();
      if (burnedBlob) {
        shareBlob = burnedBlob;
        // The raw video's object URL (deps.videoUrl, set as the initial src
        // above) is only ever referenced by this <video> element. Once the
        // burned-in blob takes over, revoke the old one so it isn't leaked
        // for the rest of the page's life.
        const oldSrc = video.getAttribute("src");
        video.setAttribute("src", URL.createObjectURL(burnedBlob));
        if (oldSrc && oldSrc.startsWith("blob:")) URL.revokeObjectURL(oldSrc);
      }
    });
  }

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

  // 工夫 section: one input per practiced drill (child writes it, no gate).
  // Saved notes reappear as reminders during the next practice.
  const kufuSection = document.createElement("div");
  kufuSection.className = "kufu-section";
  if (deps.kufuEnabled !== false && deps.kufuDrills && deps.kufuDrills.length) {
    kufuSection.dataset.kufuSection = "";
    const kufuTitle = document.createElement("div");
    kufuTitle.className = "kufu-title";
    kufuTitle.textContent = "つぎの工夫（15文字まで）";
    kufuSection.append(kufuTitle);

    deps.kufuDrills.forEach((d) => {
      const row = document.createElement("div");
      row.className = "kufu-row";
      row.dataset.kufuRow = d.name;

      const label = document.createElement("label");
      label.className = "kufu-label";
      label.textContent = d.name;

      const input = document.createElement("input");
      input.className = "kufu-input";
      input.dataset.kufuInput = d.name;
      input.maxLength = KUFU_MAX_LEN;
      input.placeholder = "こうしよう！";
      input.value = d.current;

      const save = document.createElement("button");
      save.className = "kufu-save";
      save.dataset.kufuSave = d.name;
      save.textContent = "保存";
      if (d.canAdd === false) {
        input.disabled = true;
        save.disabled = true;
        save.title = "ほかの種目の工夫がいっぱいです";
      }
      const persist = () => {
        const text = input.value.trim().slice(0, KUFU_MAX_LEN);
        if (!text) return;
        deps.onSaveKufu?.(d.name, text);
        save.textContent = "保存済 ✓";
        setTimeout(() => { save.textContent = "保存"; }, 1200);
      };
      save.addEventListener("click", persist);

      row.append(label, input, save);
      kufuSection.append(row);
    });
  }

  // Save / Share Button with Parental Gate
  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  dl.textContent = `⬇ 動画を保存 (.${deps.ext})`;
  dl.addEventListener("click", () => deps.onShare(shareBlob));

  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する 🥋";
  again.addEventListener("click", () => deps.onAgain());

  root.append(celebCard, video, stats, kufuSection, dl, again);
  if (showBurninStatus) root.insertBefore(burninStatus, dl);

  // Collapsed debug panel: readable directly on the phone, no devtools
  // needed, for tracking down the iPhone Safari video-freeze bug.
  if (deps.diagnosticsText) {
    const details = document.createElement("details");
    details.dataset.diagnostics = "";
    details.style.cssText = "margin: 0.5rem 0; font-size: 0.75rem; color: #999;";
    const summary = document.createElement("summary");
    summary.textContent = "デバッグ情報";
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space: pre-wrap; word-break: break-all;";
    pre.textContent = deps.diagnosticsText;
    details.append(summary, pre);
    root.append(details);
  }
}
