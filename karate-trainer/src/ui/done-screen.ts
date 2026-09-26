import type { CharacterId } from "../character-store";
import { openKufuModal } from "./kufu-modal";
import { COPY, IS_PIANO } from "../flavor";

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
  // 「⬇ 動画を保存」: saves onto this phone (写真), so no parental gate. Return
  // a promise and the screen reports 保存したよ / できなかった when it settles.
  onShare(blob?: Blob): void | Promise<void>;
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
  // ✨キラキラ: この稽古で 新しく1つ開いたときだけ入る。集めたものは
  // キラキラタブで見られるので、ここは「開いたよ」と言うだけ。
  sparkleAward?: { name: string };
  // 🧊 この稽古で開いたブロック（絵）。開かなければ渡ってこない。
  blockAward?: { name: string };
  // 🏆 この稽古でもらったトロフィー（帯 10本ごと）。
  trophyAward?: { name: string };
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
  // ✨キラキラ: つけているキラキラを、仕上がった動画に **自動で** 焼き込む。
  // 元の動画は消えないので「もとの動画」にいつでも戻せる。
  // native（iOS 17 以上）で、キラキラをつけているときだけ渡ってくる。
  // 無ければ行ごと出ない。**どれにするか選ぶ行はもう無い**（稽古中に見えていた
  // ものと同じものが入る）。
  motionFx?: {
    /// つけているキラキラの名前（「⚡️ いなずま」）。
    name: string;
    // 作りおわった動画。途中でやめられたときは reject する。
    apply(onProgress: (phase: string, fraction: number) => void): Promise<{ playbackUrl: string; fileUri: string }>;
    cancel(): void;
    // いま画面に出ている動画。null は もとの動画。保存・送信はこれを使う。
    onCurrent(fileUri: string | null): void;
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
  title.textContent = stopped || missed ? "おつかれさま！" : `${COPY.practice}完了！よく頑張ったね！`;
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
          ? `メニューを保存すると、${COPY.belt}と積み重ねがたまるよ`
          : missed === "no-drills"
            ? "練習した種目がないので、レベルはふえないよ"
            : promotedTo
              ? `🎉 ${promotedTo}に昇級！`
              : `${COPY.belt}のバー ${bars}/10`;
    headText.append(beltLine);
  }

  // この稽古で もらったもの。出るのは もらった日だけ（毎回は出ない）。
  // 順番は「めずらしい順」: トロフィー → キラキラ → ブロック。
  const awards: [string, string | undefined][] = [
    ["trophyAward", deps.trophyAward && `🏆 ${deps.trophyAward.name} を もらったよ！`],
    ["sparkleAward", deps.sparkleAward && `✨ あたらしい キラキラ！ ${deps.sparkleAward.name}`],
    ["blockAward", deps.blockAward && `🧊 あたらしい ブロック！ ${deps.blockAward.name}`],
  ];
  awards.forEach(([mark, text]) => {
    if (!text) return;
    const line = document.createElement("p");
    line.className = "done-sparkle-award";
    line.dataset[mark] = "";
    line.textContent = text;
    headText.append(line);
  });
  header.append(trophyImg, headText, stars);

  // Video Replay
  const video = document.createElement("video");
  video.setAttribute("src", deps.videoUrl);
  video.setAttribute("playsinline", "");
  video.controls = true;

  let shareBlob: Blob | undefined;

  // もとの（かざり無しの）動画。保存が終わると仕上がったほうに差し替わる。
  let originalSrc = deps.videoUrl;

  // 動画を差し替えても、子どもが見ていたところと再生中かどうかは保つ。
  function showVideoSource(src: string): void {
    if (video.getAttribute("src") === src) return;
    const at = video.currentTime;
    const wasPlaying = !video.paused && !video.ended;
    video.addEventListener("loadedmetadata", () => {
      try { video.currentTime = Math.min(at, video.duration || at); } catch { /* not seekable yet */ }
      if (wasPlaying) void Promise.resolve(video.play()).catch(() => { /* needs a tap */ });
    }, { once: true });
    video.setAttribute("src", src);
  }

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

  // ✨キラキラ: つけているキラキラを、仕上がった動画に **自動で** 焼き込む。
  //
  // 録画そのものには手を入れない（AVFoundation がカメラの絵をそのまま書いて
  // いる）。保存のおわった動画を読んで *別のファイル* を書くので、いつでも
  // 「もとの動画」に戻せるし、保存・送信は いま見えているほうが使われる。
  //
  // **どれにするか選ぶ行は もう無い。** どのキラキラが出るかは アイテムタブで
  // 決まっていて、稽古中に画面で見えていたものと同じものが動画に入る。
  let fxRow: HTMLElement | null = null;
  let startFx = (): void => { /* キラキラをつけていない日は 何も起きない */ };
  if (deps.motionFx) {
    const fx = deps.motionFx;
    const row = document.createElement("div");
    row.className = "fx-row";
    row.dataset.motionFx = "";
    // 仕上げが終わるまで出さない: それまで もとになる動画がまだ無い。
    row.hidden = true;

    const status = document.createElement("div");
    status.className = "fx-status";
    status.dataset.fxStatus = "";
    status.textContent = `✨ ${fx.name} を つけているよ… 0%`;

    const stop = document.createElement("button");
    stop.className = "fx-stop";
    stop.dataset.fxStop = "";
    stop.textContent = "やめる";

    // できあがったら もとの動画と見くらべられるようにする（「なし」に戻る道）。
    const toggle = document.createElement("button");
    toggle.className = "fx-choice";
    toggle.dataset.fxToggle = "";
    toggle.hidden = true;
    let made: { playbackUrl: string; fileUri: string } | null = null;
    let showingFx = false;
    const paintToggle = () => { toggle.textContent = showingFx ? "↩︎ もとの動画" : "✨ キラキラ"; };
    toggle.addEventListener("click", () => {
      if (!made) return;
      showingFx = !showingFx;
      showVideoSource(showingFx ? made.playbackUrl : originalSrc);
      fx.onCurrent(showingFx ? made.fileUri : null);
      paintToggle();
    });

    stop.addEventListener("click", () => { stop.disabled = true; fx.cancel(); });

    row.append(status, stop, toggle);
    fxRow = row;
    startFx = () => {
      row.hidden = false;
      // キラキラが付くまでは保存させない: 途中で保存すると、画面で見えていた
      // ものと保存されたものが違う動画になる。
      setSaveEnabled(false);
      void fx.apply((phase, fraction) => {
        const pct = Math.floor(fraction * 100);
        // ピアノは **音** を聞いて作る（体は見ない）ので、言葉を変える。
        status.textContent = phase === "exporting"
          ? `✨ ${fx.name} を つけているよ… ${pct}%`
          : `${IS_PIANO ? "音を 聞いているよ" : "うごきを 見ているよ"}… ${pct}%`;
      }).then((result) => {
        made = result;
        showingFx = true;
        showVideoSource(result.playbackUrl);
        fx.onCurrent(result.fileUri);
        status.textContent = `✨ ${fx.name} が ついたよ！`;
        toggle.hidden = false;
        paintToggle();
        showDoneToast(root, "✨ キラキラが ついたよ！");
      }).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        if (/cancel/i.test(message)) {
          status.textContent = "キラキラは やめたよ";
        } else {
          console.error("motion effects failed", e);
          status.textContent = "⚠️ キラキラは つけられなかった（もとの動画はそのままだよ）";
        }
      }).finally(() => {
        stop.hidden = true;
        // 付いても付かなくても、ここから先は保存できる。
        setSaveEnabled(true);
      });
    };
  }

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
  const saveButtons: HTMLButtonElement[] = [dl];
  function setSaveEnabled(on: boolean) {
    saveButtons.forEach((b) => { b.disabled = !on; });
  }
  dl.addEventListener("click", () => {
    shareTapped = true;
    const saving = deps.onShare(shareBlob);
    if (!saving) return;   // caller reports by itself (share sheet / web)
    // Saving straight to 写真 shows nothing of its own, so say so here.
    setSaveEnabled(false);
    void saving.then(() => showDoneToast(root, "✅ しゃしんに ほぞんしたよ！"))
      .catch((e) => {
        console.error("saving the video failed", e);
        showDoneToast(root, "⚠️ ほぞんできなかった。おうちの人にそうだんしてね", 4000);
      })
      .finally(() => setSaveEnabled(true));
  });

  const confirm = deps.confirm
    ?? ((m: string) => (typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(m) !== false : true));
  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = `もう一度 ${COPY.againIcon}`;
  again.addEventListener("click", () => {
    if (!shareTapped && !confirm(`動画はまだ保存していません。保存しないで もう一度 ${COPY.practice}しますか？`)) return;
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
      // 仕上がったほうが「もとの動画」になる: ✨キラキラ の「なし」はここへ戻る。
      originalSrc = result.playbackUrl;
      showVideoSource(result.playbackUrl);
      startFx();
      showDoneToast(root, "✅ 動画ができたよ！");
      if (video.isConnected) deps.finishing?.onShown?.();
    }).catch(finished);
  }

  // Nothing to save or send until the finished video exists.
  if (deps.finishing) setSaveEnabled(false);
  else startFx();

  root.append(header, split, ...(fxRow ? [fxRow] : []), sheetSlot, actions, sendNode);
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

// Short message over the done screen (動画ができたよ / 写真にほぞんしたよ).
function showDoneToast(root: HTMLElement, text: string, ms = 2500): void {
  root.querySelectorAll("[data-finish-toast]").forEach((el) => el.remove());
  const toast = document.createElement("div");
  toast.className = "done-toast";
  toast.dataset.finishToast = "";
  toast.textContent = text;
  root.append(toast);
  setTimeout(() => toast.remove(), ms);
}
