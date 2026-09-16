import { CHARACTERS, type CharacterId } from "../character-store";
import { createCompanionAvatar } from "./companion-avatar";
import { openKufuModal } from "./kufu-modal";

export interface DoneKufuDrill {
  name: string;
}

// Why a practice run to the end still earned no belt bar.
// "interrupted": the recording was stopped by the phone (call, app switch).
// "no-menu": the menu was never saved, so there is no belt to fill.
export type BeltMissReason = "no-menu" | "no-drills" | "interrupted";

export interface DoneBeltResult {
  completed: boolean;
  bars: number;
  promotedTo: string | null;
  missed?: BeltMissReason;
}

export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(blob?: Blob): void;
  // A parent allowed this kid to send videos out (家族 tab): show 「LINE・SNSで
  // 送る」, which calls onSend with no gate. Otherwise only a note is shown.
  shareAllowed?: boolean;
  onSend?(blob?: Blob): void;
  onAgain(): void;
  // Asked before もう一度 when the video hasn't been saved yet (it is lost once
  // the next practice starts). Defaults to window.confirm.
  confirm?(message: string): boolean;
  characterId?: CharacterId;
  // Belt progress from this practice. completed=false (stopped with 終了) means
  // nothing was added; missed says why a run to the end added no bar (a drill
  // was skipped, or no drill was practiced); promotedTo names the new belt when
  // the 10th bar landed.
  beltResult?: DoneBeltResult;
  // 工夫: drills practiced this session (deduped, rest excluded). Each row opens
  // the same 💡 card as the setup screen (list + 「けす」 + add one more).
  kufuDrills?: DoneKufuDrill[];
  kufuPerDrill?: number;
  kufuFor?(drillName: string): string[];
  canAddKufuFor?(drillName: string): boolean;
  onAddKufu?(drillName: string, text: string): void;
  onRemoveKufu?(drillName: string, index: number): void;
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
  // Resolves to the burnOverlay() failure message, or null if burn-in
  // succeeded/was skipped. Settles after burnInPromise (same underlying
  // burn-in call) — appended to the debug panel once known, so a burn-in
  // failure is visible on-device instead of only in the console.
  burnInErrorPromise?: Promise<string | null>;
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
  const stopped = deps.beltResult?.completed === false;
  const missed = deps.beltResult?.missed;
  title.textContent = stopped || missed ? "おつかれさま！" : "稽古完了！よく頑張ったね！";

  const praise = document.createElement("p");
  praise.style.cssText = "margin: 0; color: #ffd166; font-weight: 800; font-size: 1.05rem;";
  praise.textContent = `${companionInfo.name}: 「${companionInfo.cheerClips[0]?.text ?? "応援するよ"}」`;

  celebCard.append(trophyImg, companionAvatar.element, stars, title, praise);

  if (deps.beltResult) {
    const { bars, promotedTo } = deps.beltResult;
    const beltLine = document.createElement("p");
    beltLine.className = `done-belt-result${promotedTo ? " promoted" : ""}`;
    beltLine.dataset.beltResult = "";
    beltLine.textContent = missed === "interrupted"
      ? "録画がとちゅうで止まったので、レベルはふえないよ"
      : stopped
        ? "とちゅうで終了したので、レベルはふえないよ"
        : missed === "no-menu"
          ? "メニューを保存すると、帯と強さがたまるよ"
          : missed === "no-drills"
            ? "練習した種目がないので、レベルはふえないよ"
            : promotedTo
              ? `🎉 ${promotedTo}に昇級！`
              : `帯のバー ${bars}/10`;
    celebCard.append(beltLine);
  }

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
  // 掛け声 was a count of the app's own cheers — nothing the child did, so it
  // told them nothing about their practice.
  stats.append(stat(deps.stats.time, "時間"), stat(deps.stats.drills, "種目"));

  // 工夫 section: one row per practiced drill showing its newest 工夫, and a 💡
  // button opening the card to add or erase (child writes it, no gate).
  // Saved notes reappear as reminders during the next practice.
  const kufuSection = document.createElement("div");
  kufuSection.className = "kufu-section";
  if (deps.kufuEnabled !== false && deps.kufuDrills && deps.kufuDrills.length) {
    kufuSection.dataset.kufuSection = "";
    const kufuTitle = document.createElement("div");
    kufuTitle.className = "kufu-title";
    kufuTitle.textContent = "今後やるときの工夫を書いておこう！";
    kufuSection.append(kufuTitle);

    deps.kufuDrills.forEach((d) => {
      const row = document.createElement("div");
      row.className = "kufu-row";
      row.dataset.kufuRow = d.name;

      const label = document.createElement("label");
      label.className = "kufu-label";
      label.textContent = d.name;

      const latest = document.createElement("div");
      latest.className = "kufu-latest";
      latest.dataset.kufuLatest = d.name;

      const open = document.createElement("button");
      open.className = "kufu-open";
      open.dataset.kufuOpen = d.name;

      const notes = () => deps.kufuFor?.(d.name) ?? [];
      const paint = () => {
        const list = notes();
        latest.textContent = list[0] ?? "まだないよ";
        latest.classList.toggle("is-empty", !list.length);
        open.textContent = list.length ? `💡 ${list.length}` : "💡 かく";
      };
      paint();
      open.addEventListener("click", () => {
        openKufuModal(root, {
          drillName: d.name,
          perDrill: deps.kufuPerDrill,
          notes,
          canAdd: () => deps.canAddKufuFor?.(d.name) ?? true,
          onAdd: (text) => deps.onAddKufu?.(d.name, text),
          onRemove: (index) => deps.onRemoveKufu?.(d.name, index),
          onClose: () => paint(),
        });
      });

      row.append(label, latest, open);
      kufuSection.append(row);
    });
  }

  // Save / Share Button with Parental Gate
  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  dl.textContent = `⬇ 動画を保存 (.${deps.ext})`;
  let shareTapped = false;
  dl.addEventListener("click", () => { shareTapped = true; deps.onShare(shareBlob); });

  const confirm = deps.confirm
    ?? ((m: string) => (typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(m) !== false : true));
  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する 🥋";
  again.addEventListener("click", () => {
    if (!shareTapped && !confirm("動画はまだ保存していません。保存しないで もう一度 稽古しますか？")) return;
    deps.onAgain();
  });

  // Sending the video out (LINE, Instagram, TikTok… all live in the share
  // sheet — iOS can't aim a video at one app without its SDK). Only for kids a
  // parent allowed on the 家族 tab; that setting is the gate, so none here.
  let sendNode: HTMLElement;
  if (deps.shareAllowed) {
    const send = document.createElement("button");
    send.dataset.share = ""; send.className = "btn-share"; send.textContent = "LINE・SNSで送る";
    send.addEventListener("click", () => { shareTapped = true; deps.onSend?.(shareBlob); });
    sendNode = send;
  } else {
    sendNode = document.createElement("div");
    sendNode.dataset.shareNote = ""; sendNode.className = "share-note";
    sendNode.textContent = "LINE・SNSで送るのは、おうちの人にそうだんしてね。";
  }

  // Right above the video: what to do with it. Without a prompt the video just
  // sat there and the 工夫 box below it got filled in from memory instead.
  const watchHint = document.createElement("div");
  watchHint.className = "done-watch-hint";
  watchHint.dataset.watchHint = "";
  watchHint.textContent = "自分で見返してみよう";

  root.append(celebCard, watchHint, video, stats, kufuSection, dl, again, sendNode);
  if (showBurninStatus) root.insertBefore(burninStatus, dl);

  // Collapsed debug panel: readable directly on the phone, no devtools
  // needed, for tracking down the iPhone Safari video-freeze bug. Shown
  // unconditionally (even with nothing logged) so a "no debug panel at all"
  // report is never ambiguous between "nothing happened" and "it's hidden".
  // Development only (or VITE_SHOW_DIAGNOSTICS=true): never in the App Store build.
  if (import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === "true") {
    const details = document.createElement("details");
    details.dataset.diagnostics = "";
    details.style.cssText = "margin: 0.5rem 0; font-size: 0.75rem; color: #999;";
    const summary = document.createElement("summary");
    summary.textContent = "デバッグ情報";
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space: pre-wrap; word-break: break-all;";
    pre.textContent = deps.diagnosticsText || "(no events logged)";
    details.append(summary, pre);
    root.append(details);

    if (deps.burnInErrorPromise) {
      void deps.burnInErrorPromise.then((message) => {
        if (!message) return;
        pre.textContent = `burn-in failed: ${message}\n\n${pre.textContent}`;
      });
    }
  }
}
