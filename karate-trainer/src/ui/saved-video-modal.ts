// 「前回の動画」 card (native). Shown over the 今日の稽古 screen when a video
// finished without anyone watching it — typically the app was killed while
// saving and the save was finished on the next launch — or while such a save
// is still running. Reuses the 工夫 card's look.
//
// Only reports actions: sharing, the parental gate and "seen" stay with the
// caller.

export interface SavedVideoModalDeps {
  // A finished video (ready now) or a save still running.
  ready?: { playbackUrl: string };
  saving?: {
    progress: number;
    onProgress(fn: (fraction: number) => void): void;
    done: Promise<{ playbackUrl: string } | null>;
  };
  // A parent allowed this kid to send videos (家族 tab).
  shareAllowed: boolean;
  onSave(): void;
  onSend(): void;
  // The finished video was on screen.
  onShown(): void;
  onClose(): void;
}

export function openSavedVideoModal(host: HTMLElement, deps: SavedVideoModalDeps): () => void {
  host.querySelectorAll("[data-saved-video-modal]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay";
  overlay.dataset.savedVideoModal = "";

  const card = document.createElement("div");
  card.className = "kufu-card saved-video-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  title.dataset.savedVideoTitle = "";

  const status = document.createElement("div");
  status.className = "kufu-card-hint";
  status.dataset.savedVideoStatus = "";

  const video = document.createElement("video");
  video.className = "saved-video";
  video.setAttribute("playsinline", "");
  video.controls = true;
  video.hidden = true;

  const actions = document.createElement("div");
  actions.className = "saved-video-actions";

  const save = document.createElement("button");
  save.className = "btn-dl";
  save.dataset.savedVideoSave = "";
  save.textContent = "⬇ 動画を保存";
  save.addEventListener("click", () => deps.onSave());
  actions.append(save);

  if (deps.shareAllowed) {
    const send = document.createElement("button");
    send.className = "btn-share";
    send.dataset.savedVideoSend = "";
    send.textContent = "LINE・SNSで送る";
    send.addEventListener("click", () => deps.onSend());
    actions.append(send);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "kufu-card-cancel";
  closeBtn.dataset.savedVideoClose = "";
  closeBtn.textContent = "とじる";

  card.append(title, status, video, actions, closeBtn);
  overlay.append(card);
  host.append(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    video.pause();
    overlay.remove();
  };
  closeBtn.addEventListener("click", () => {
    close();
    deps.onClose();
  });

  const showReady = (playbackUrl: string) => {
    title.textContent = "前回の動画ができたよ！";
    status.textContent = "自分で見返して、工夫を考えてみよう";
    video.setAttribute("src", playbackUrl);
    video.hidden = false;
    actions.hidden = false;
    if (!closed) deps.onShown();
  };

  if (deps.ready) {
    showReady(deps.ready.playbackUrl);
  } else if (deps.saving) {
    title.textContent = "前回の動画を仕上げ中…";
    actions.hidden = true;
    const paint = (fraction: number) => { status.textContent = `${Math.floor(fraction * 100)}%`; };
    paint(deps.saving.progress);
    deps.saving.onProgress(paint);
    void deps.saving.done.then((result) => {
      if (closed) return;
      if (result) showReady(result.playbackUrl);
      else close();
    });
  }

  return close;
}
