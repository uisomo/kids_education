// 家族 tab: 「保護者の方へ」 (how to keep the practice going) and the 使い方どうが
// — short clips made from real app screens by tools/howto/render-howto.swift
// (spec: tools/howto/howto.json). They are streamed, not bundled (13 MB):
// karate-trainer/howto-site is deployed on its own to the 「howto」 branch of
// the Pages project, so the live web app is never touched:
//   npx wrangler pages deploy karate-trainer/howto-site --project-name=karate-trainer --branch=howto
const HOWTO_BASE = "https://howto.karate-trainer.pages.dev/howto";

export interface HowtoVideo {
  id: string;
  label: string;
  src: string;
}

export const HOWTO_VIDEOS: HowtoVideo[] = [
  { id: "menu", label: "📝 メニューを作る", src: `${HOWTO_BASE}/howto-menu.mp4` },
  { id: "kufu", label: "💡 工夫を入れる", src: `${HOWTO_BASE}/howto-kufu.mp4` },
  { id: "order", label: "↕️ 順番を入れかえる", src: `${HOWTO_BASE}/howto-order.mp4` },
  { id: "delete", label: "🗑 メニューを消す", src: `${HOWTO_BASE}/howto-delete.mp4` },
  { id: "member", label: "👤 使う人をかえる", src: `${HOWTO_BASE}/howto-member.mp4` },
  { id: "hook", label: "🪝 フックを作る", src: `${HOWTO_BASE}/howto-hook.mp4` },
];

export const PARENT_NOTE_LINES = [
  "お子さんの成長を見たいときは、稽古のあとに「LINE・SNSで送る」でご家族に送るか、「動画を保存」して、あとで一緒に見返しましょう。",
  "見返すときは、言いたいことはたくさんあると思いますが、まずは褒めてあげてください。",
  "そのうえで、お子さん自身に動画を見てもらい、気づいたことを 💡工夫 に書くよう促してください。",
  "少し上達させることより、続けることを習慣にし、自分で気づいて直せるようになることの方が、はるかに大切です。",
  "やり方がわからないときは、まずは簡単な型や技ひとつからでも構いません。",
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

export function buildHowtoSection(host: HTMLElement): Node[] {
  const title = document.createElement("div");
  title.className = "family-section-label";
  title.textContent = "使い方どうが";

  const grid = document.createElement("div");
  grid.className = "howto-grid";
  grid.dataset.howtoList = "";
  for (const v of HOWTO_VIDEOS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "howto-btn";
    btn.dataset.howto = v.id;
    btn.textContent = v.label;
    btn.addEventListener("click", () => openHowtoVideo(host, v));
    grid.append(btn);
  }
  return [title, grid];
}

// Plays one clip in the 工夫 card look; tapping outside or 「とじる」 closes it.
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

  const close = document.createElement("button");
  close.type = "button";
  close.className = "kufu-card-cancel";
  close.dataset.howtoClose = "";
  close.textContent = "とじる";

  const dispose = () => {
    try { video.pause(); } catch { /* jsdom */ }
    overlay.remove();
  };
  close.addEventListener("click", dispose);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dispose(); });

  card.append(title, video, offline, close);
  overlay.append(card);
  host.append(overlay);
  try {
    void Promise.resolve(video.play()).catch(() => { /* needs a tap on ▶ */ });
  } catch { /* jsdom */ }
  return dispose;
}
