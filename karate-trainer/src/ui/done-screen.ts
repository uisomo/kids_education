import type { CharacterId } from "../character-store";
import { openKufuModal } from "./kufu-modal";

export interface DoneKufuDrill {
  name: string;
  // Seconds into the video where this drill first starts (tap the name to jump).
  at?: number;
}

function formatAt(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  // Native: videoUrl is the bare camera capture, playable at once so the child
  // can watch themselves while writing a 工夫. The overlay and sound are still
  // being added; `done` resolves with the finished video, which then replaces
  // it. Saving and sending wait for it.
  finishing?: {
    done: Promise<{ playbackUrl: string; fileUri: string } | null>;
    onProgress(fn: (fraction: number) => void): void;
    // The finished video made it onto the screen.
    onShown?(): void;
  };
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

export function renderDoneScreen(root: HTMLElement, deps: DoneDeps): void {
  root.textContent = "";
  root.className = "screen done";

  // Header: one slim row, so the video and the 工夫 list fit on one screen.
  const header = document.createElement("div");
  header.className = "done-header";

  const trophyImg = document.createElement("img");
  trophyImg.className = "done-trophy-img";
  trophyImg.src = "/badges/victory_trophy.jpg";
  trophyImg.alt = "優勝トロフィー";

  const headText = document.createElement("div");
  headText.className = "done-head-text";

  const title = document.createElement("h2");
  title.className = "done-title";
  const stopped = deps.beltResult?.completed === false;
  const missed = deps.beltResult?.missed;
  title.textContent = stopped || missed ? "おつかれさま！" : "稽古完了！よく頑張ったね！";
  headText.append(title);

  const stars = document.createElement("div");
  stars.className = "done-stars";
  stars.textContent = "⭐⭐⭐";

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
    headText.append(beltLine);
  }
  header.append(trophyImg, headText, stars);

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

  // 工夫 list beside the video: one row per practiced drill with its newest
  // 工夫 and a 💡 button, so the child writes while watching themselves. The
  // drill name jumps the video to where that drill starts. Many drills scroll
  // inside the column; the video stays put.
  const kufuOn = deps.kufuEnabled !== false && !!deps.kufuDrills?.length;
  const kufuSection = document.createElement("div");
  kufuSection.className = "kufu-section";
  const kufuScroll = document.createElement("div");
  kufuScroll.className = "kufu-scroll";
  const paintMore = () => {
    const more = kufuScroll.scrollTop + kufuScroll.clientHeight < kufuScroll.scrollHeight - 4;
    kufuSection.classList.toggle("has-more", more);
  };
  kufuScroll.addEventListener("scroll", paintMore, { passive: true });

  let closeSheet: (() => void) | null = null;
  if (kufuOn) {
    kufuSection.dataset.kufuSection = "";
    const kufuTitle = document.createElement("div");
    kufuTitle.className = "kufu-title";
    kufuTitle.textContent = "見ながら 工夫を書こう";
    const scrollBox = document.createElement("div");
    scrollBox.className = "kufu-scroll-box";
    scrollBox.append(kufuScroll);
    kufuSection.append(kufuTitle, scrollBox);

    deps.kufuDrills!.forEach((d) => {
      const row = document.createElement("div");
      row.className = "kufu-row";
      row.dataset.kufuRow = d.name;

      const text = document.createElement("div");
      text.className = "kufu-text";

      const label = document.createElement("button");
      label.className = "kufu-label";
      label.textContent = d.name;
      if (d.at !== undefined) {
        const at = d.at;
        label.dataset.kufuJump = String(at);
        const jump = document.createElement("span");
        jump.className = "kufu-jump";
        jump.textContent = `▶${formatAt(at)}`;
        label.append(jump);
        label.addEventListener("click", () => {
          try { video.currentTime = at; } catch { /* not seekable yet */ }
          void Promise.resolve(video.play()).catch(() => { /* needs a tap */ });
        });
      } else {
        label.disabled = true;
      }

      const latest = document.createElement("div");
      latest.className = "kufu-latest";
      latest.dataset.kufuLatest = d.name;
      text.append(label, latest);

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
        // The video keeps playing: the child writes while watching.
        root.classList.add("is-writing");
        window.scrollTo(0, 0);
        closeSheet = openKufuModal(sheetSlot, {
          drillName: d.name,
          perDrill: deps.kufuPerDrill,
          sheet: true,
          onPlace: (room) => root.style.setProperty("--kufu-room", `${Math.max(0, room)}px`),
          notes,
          canAdd: () => deps.canAddKufuFor?.(d.name) ?? true,
          onAdd: (text) => deps.onAddKufu?.(d.name, text),
          onRemove: (index) => deps.onRemoveKufu?.(d.name, index),
          onClose: () => {
            closeSheet = null;
            root.classList.remove("is-writing");
            paint();
          },
        });
      });

      row.append(text, open);
      kufuScroll.append(row);
    });
  }

  // The 工夫 card opens here, right under the video, in the page flow: iOS
  // then scrolls it above the keyboard itself (a fixed sheet got covered).
  const sheetSlot = document.createElement("div");
  sheetSlot.className = "kufu-sheet-slot";

  const split = document.createElement("div");
  split.className = kufuOn ? "done-split" : "done-split is-solo";
  split.append(video, ...(kufuOn ? [kufuSection] : []));

  // Save / Share Button with Parental Gate
  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  const dlFill = document.createElement("span");
  dlFill.className = "btn-dl-fill";
  const dlText = document.createElement("span");
  dlText.className = "btn-dl-text";
  dlText.textContent = "⬇ 動画を保存";
  dl.append(dlFill, dlText);
  let shareTapped = false;
  dl.addEventListener("click", () => { shareTapped = true; deps.onShare(shareBlob); });
  const saveButtons: HTMLButtonElement[] = [dl];
  function setSaveEnabled(on: boolean) {
    saveButtons.forEach((b) => { b.disabled = !on; });
  }

  const confirm = deps.confirm
    ?? ((m: string) => (typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(m) !== false : true));
  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 🥋";
  again.addEventListener("click", () => {
    if (!shareTapped && !confirm("動画はまだ保存していません。保存しないで もう一度 稽古しますか？")) return;
    closeSheet?.();
    deps.onAgain();
  });

  const actions = document.createElement("div");
  actions.className = "done-actions";
  actions.append(dl, again);

  // Sending the video out (LINE, Instagram, TikTok… all live in the share
  // sheet — iOS can't aim a video at one app without its SDK). Only for kids a
  // parent allowed on the 家族 tab; that setting is the gate, so none here.
  let sendNode: HTMLElement;
  if (deps.shareAllowed) {
    const send = document.createElement("button");
    send.dataset.share = ""; send.className = "btn-share"; send.textContent = "LINE・SNSで送る";
    send.addEventListener("click", () => { shareTapped = true; deps.onSend?.(shareBlob); });
    saveButtons.push(send);
    sendNode = send;
  } else {
    sendNode = document.createElement("div");
    sendNode.dataset.shareNote = ""; sendNode.className = "share-note";
    sendNode.textContent = "LINE・SNSで送るのは、おうちの人にそうだんしてね。";
  }

  // Native: the capture plays now; the finished one swaps in where the child
  // is. The save button doubles as the progress bar until then.
  if (deps.finishing) {
    dl.dataset.finishStatus = "";
    dl.classList.add("is-finishing");
    const paint = (fraction: number) => {
      const pct = Math.floor(fraction * 100);
      dlText.textContent = `仕上げ中… ${pct}%`;
      dlFill.style.width = `${pct}%`;
    };
    const finished = () => {
      dl.classList.remove("is-finishing");
      delete dl.dataset.finishStatus;
      dlFill.style.width = "";
      dlText.textContent = "⬇ 動画を保存";
      setSaveEnabled(true);
    };
    paint(0);
    deps.finishing.onProgress(paint);
    void deps.finishing.done.then((result) => {
      finished();
      if (!result) return;
      const at = video.currentTime;
      const wasPlaying = !video.paused && !video.ended;
      video.addEventListener("loadedmetadata", () => {
        try { video.currentTime = Math.min(at, video.duration || at); } catch { /* not seekable yet */ }
        if (wasPlaying) void Promise.resolve(video.play()).catch(() => { /* needs a tap */ });
      }, { once: true });
      video.setAttribute("src", result.playbackUrl);
      const toast = document.createElement("div");
      toast.className = "done-toast";
      toast.dataset.finishToast = "";
      toast.textContent = "✅ 動画ができたよ！";
      root.append(toast);
      setTimeout(() => toast.remove(), 2500);
      if (video.isConnected) deps.finishing?.onShown?.();
    }).catch(finished);
  }

  // Nothing to save or send until the finished video exists.
  if (deps.finishing) setSaveEnabled(false);

  root.append(header, split, sheetSlot, actions, sendNode);
  if (showBurninStatus) root.insertBefore(burninStatus, actions);
  if (kufuOn) requestAnimationFrame(paintMore);

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
