// 「保護者の方へ」 (家族 tab) and the 使い方どうが — opened from the 🎬 mark in the
// 特訓 tab's header, where somebody who is about to practise can actually find
// them (they used to sit halfway down the long 家族 tab).
//
// The clips are short videos made from real app screens
// by tools/howto/render-howto.swift
// (spec: tools/howto/howto.json). They are streamed, not bundled (13 MB):
// karate-trainer/howto-site is deployed on its own to the 「howto」 branch of
// the Pages project, so the live web app is never touched:
//   npx wrangler pages deploy karate-trainer/howto-site --project-name=karate-trainer --branch=howto
const HOWTO_BASE = "https://howto.karate-trainer.pages.dev/howto";

import { COPY, IS_PIANO } from "../flavor";
import { modalHead } from "./modal-head";
import { type IconName, plainIcon } from "../alan/alan-icons.js";

export interface HowtoVideo {
  id: string;
  label: string;
  icon?: IconName;   // series icon (alan-icons); none where no meaning fits
  src: string;
}

export const HOWTO_VIDEOS: HowtoVideo[] = [
  { id: "menu", label: "メニューを作る", icon: "add", src: `${HOWTO_BASE}/howto-menu.mp4` },
  { id: "kufu", label: "工夫を入れる", icon: "idea", src: `${HOWTO_BASE}/howto-kufu.mp4` },
  { id: "order", label: "順番を入れかえる", src: `${HOWTO_BASE}/howto-order.mp4` },
  { id: "delete", label: "メニューを消す", icon: "trash", src: `${HOWTO_BASE}/howto-delete.mp4` },
  { id: "member", label: "使う人をかえる", icon: "child", src: `${HOWTO_BASE}/howto-member.mp4` },
  { id: "hook", label: "フックを作る", icon: "sound", src: `${HOWTO_BASE}/howto-hook.mp4` },
];

export const PARENT_NOTE_LINES = [
  `お子さんの成長を見たいときは、${COPY.practice}のあとに「LINE・SNSで送る」でご家族に送るか、「動画を保存」して、あとで一緒に見返しましょう。`,
  "見返すときは、言いたいことはたくさんあると思いますが、まずは褒めてあげてください。",
  "そのうえで、お子さん自身に動画を見てもらい、気づいたことを 💡工夫 に書くよう促してください。",
  "少し上達させることより、続けることを習慣にし、自分で気づいて直せるようになることの方が、はるかに大切です。",
  IS_PIANO
    ? "やり方がわからないときは、まずは簡単な曲やフレーズひとつからでも構いません。"
    : "やり方がわからないときは、まずは簡単な型や技ひとつからでも構いません。",
];

export function buildParentNote(): Node[] {
  const box = document.createElement("div");
  box.className = "parent-note";
  box.dataset.parentNote = "";

  const heading = document.createElement("div");
  heading.className = "parent-note-title";
  heading.textContent = "保護者の方へ";

  const list = document.createElement("ul");
  list.className = "parent-note-list";
  for (const line of PARENT_NOTE_LINES) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }

  const share = document.createElement("div");
  share.className = "family-plan-note";
  share.textContent = "「LINE・SNSで送る」ボタンは、上の「LINE・SNS」をチェックすると表示されます。";

  box.append(heading, list, share);
  return [box];
}

/// どうがの一覧（1つ押すと その動画が上にひらく）。
function buildHowtoList(host: HTMLElement): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "howto-grid";
  grid.dataset.howtoList = "";
  for (const v of HOWTO_VIDEOS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "howto-btn";
    btn.dataset.howto = v.id;
    btn.classList.add("with-icon");
    if (v.icon) btn.append(plainIcon(v.icon, "s"));
    btn.append(v.label);
    btn.addEventListener("click", () => openHowtoVideo(host, v));
    grid.append(btn);
  }
  return grid;
}

/// 🎬 特訓タブの ヘッダーの 🎬 から開く、使い方どうがの一覧。
export function openHowtoMenu(host: HTMLElement): () => void {
  host.querySelectorAll("[data-howto-menu]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay";
  overlay.dataset.howtoMenu = "";

  const card = document.createElement("div");
  card.className = "kufu-card howto-menu-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  title.textContent = "使い方どうが";

  const hint = document.createElement("div");
  hint.className = "kufu-card-hint";
  hint.textContent = "見たいものを おしてね";

  const dispose = () => {
    // 上に動画が開いていたら いっしょに閉じる。
    host.querySelectorAll("[data-howto-modal]").forEach((el) => el.remove());
    overlay.remove();
  };
  const { head } = modalHead(title, dispose, "howtoMenuClose");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dispose(); });

  card.append(head, hint, buildHowtoList(host));
  overlay.append(card);
  host.append(overlay);
  return dispose;
}

// Plays one clip in the 工夫 card look; tapping outside or the × closes it.
export function openHowtoVideo(host: HTMLElement, v: HowtoVideo): () => void {
  host.querySelectorAll("[data-howto-modal]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay";
  overlay.dataset.howtoModal = "";

  const card = document.createElement("div");
  card.className = "kufu-card howto-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  title.textContent = v.label;

  const video = document.createElement("video");
  video.className = "howto-video";
  video.dataset.howtoVideo = "";
  video.setAttribute("playsinline", "");
  video.controls = true;
  video.src = v.src;

  // Streamed, so it needs a connection.
  const offline = document.createElement("div");
  offline.className = "kufu-card-hint";
  offline.dataset.howtoOffline = "";
  offline.textContent = "ネットにつながると見られます";
  offline.hidden = true;
  video.addEventListener("error", () => { offline.hidden = false; });

  const dispose = () => {
    try { video.pause(); } catch { /* jsdom */ }
    overlay.remove();
  };
  const { head } = modalHead(title, dispose, "howtoClose");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dispose(); });

  card.append(head, video, offline);
  overlay.append(card);
  host.append(overlay);
  try {
    void Promise.resolve(video.play()).catch(() => { /* needs a tap on ▶ */ });
  } catch { /* jsdom */ }
  return dispose;
}
