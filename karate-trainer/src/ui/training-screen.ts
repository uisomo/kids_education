import type { CheerClip } from "../character-store";
import type { Drill } from "../types";
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from "../character-store";
import type { Decor } from "../decor-store";

// The かざり the saved video will carry, shown live at the same place so a
// parent can see what it covers before the child is hidden behind it.
const DECOR_SRC: Record<Exclude<Decor, "none">, string> = {
  frame: "/images/decor-frame.png",
  icon: "/images/decor-icon.png",
  banner: "/images/decor-banner.png",
};

export interface TrainingView {
  videoEl: HTMLVideoElement;
  setDrill(drill: Drill, index: number, total: number): void;
  setTime(secondsLeft: number): void;
  // 🪝 read-aloud hook (before Ready → Go!!): build the (hidden) word grid and
  // show the 読み上げよう hint; null → hook over (grid removed, timer shown).
  setTexts(grid: string[][] | null): void;
  // Reveal word #i (reading order) with the zoom-out animation.
  revealText(index: number): void;
  // Returns the cheer clip that started playing, or null.
  showCue(text: string): CheerClip | null;
  setNext(text: string | null): void;
  setCaption(text: string): void;   // 工夫 reminder at the bottom (text only; the video labels it)
  setRecElapsed(text: string): void;
  setPaused(paused: boolean): void;
  setBgmMuted(muted: boolean): void;
  onPause(cb: () => void): void;
  onSkip(cb: () => void): void;
  onStop(cb: () => void): void;
  onToggleBgm(cb: () => void): void;
}

export function renderTrainingScreen(
  root: HTMLElement,
  characterId: CharacterId = "alan",
  decor: Decor = "none"
): TrainingView {
  root.textContent = "";
  root.className = "screen training";

  // Dojo backdrop behind the camera feed (shows around/behind the mirrored video).
  const dojoBg = document.createElement("div");
  dojoBg.className = "training-dojo-bg";
  dojoBg.setAttribute("aria-hidden", "true");

  // Video element (mirrored)
  const videoEl = document.createElement("video");
  videoEl.setAttribute("playsinline", "");
  videoEl.muted = true;
  videoEl.className = "mirror";

  // Top bar with REC and progress
  const topBar = document.createElement("div");
  topBar.className = "training-top-bar";

  const recEl = document.createElement("div");
  recEl.dataset.rec = "";
  recEl.className = "rec";
  recEl.textContent = "REC 00:00";

  const progEl = document.createElement("div");
  progEl.dataset.prog = "";
  progEl.className = "prog";
  progEl.textContent = "";

  const BGM_ON_LABEL = "🎵 BGM";
  const BGM_OFF_LABEL = "🔇 BGM";
  const bgmBtn = document.createElement("button");
  bgmBtn.dataset.bgmToggle = "";
  bgmBtn.className = "bgm-toggle-btn";
  bgmBtn.textContent = BGM_ON_LABEL;
  bgmBtn.setAttribute("aria-label", "練習BGM on/off");

  topBar.append(recEl, bgmBtn, progEl);

  // Companion cheer overlay: a transparent (green-screen removed) character
  // video that pops up beside the countdown on each cue, then hides. A random
  // character cheers each time — no partner selection anymore.
  const companionOverlay = document.createElement("div");
  companionOverlay.className = "companion-training-overlay";
  companionOverlay.dataset.companion = "";

  const cheerVideo = document.createElement("video");
  cheerVideo.className = "companion-cheer-video";
  // The animation plays muted and once per cheer. Its voice is played by the app
  // (KarateAppDeps.playCheerVoice): on iOS a second audible media element pauses
  // the first, which stopped the music whenever a character spoke.
  cheerVideo.muted = true;
  cheerVideo.setAttribute("playsinline", "");
  cheerVideo.loop = false;

  const speechBubble = document.createElement("div");
  speechBubble.className = "companion-speech-bubble";
  speechBubble.dataset.speech = "";
  speechBubble.textContent = "がんばれ！";

  companionOverlay.append(cheerVideo, speechBubble);

  // Center content
  const centerContent = document.createElement("div");
  centerContent.className = "training-center";

  const drillEl = document.createElement("div");
  drillEl.dataset.drill = "";
  drillEl.className = "drill-name";
  drillEl.textContent = "";

  const timerEl = document.createElement("div");
  timerEl.dataset.timer = "";
  timerEl.className = "timer";
  timerEl.textContent = "0";

  // The character pops up right beside the number, where the child is already
  // looking; the row centres on the number alone.
  const timerRow = document.createElement("div");
  timerRow.className = "training-timer-row";
  timerRow.append(timerEl, companionOverlay);

  centerContent.append(drillEl, timerRow);

  // 🪝 hook: 読み上げよう hint + the word grid. Both live-only DOM — the
  // burn-in pass renders the words from the overlay event log, never these.
  const readHint = document.createElement("div");
  readHint.dataset.readHint = "";
  readHint.className = "read-aloud-hint";
  readHint.textContent = "📢 読み上げよう！";
  readHint.hidden = true;

  const textGrid = document.createElement("div");
  textGrid.dataset.textGrid = "";
  textGrid.className = "text-grid";
  textGrid.hidden = true;

  // Cue toast
  const cueEl = document.createElement("div");
  cueEl.dataset.cue = "";
  cueEl.className = "cue-toast";
  cueEl.textContent = "";

  // Next hint
  // 「Next / 前蹴り」: the name alone read as a stray word on the screen, so it
  // carries its own label.
  const nextEl = document.createElement("div");
  nextEl.dataset.next = "";
  nextEl.className = "next-hint";
  const nextLabel = document.createElement("span");
  nextLabel.className = "next-hint-label";
  nextLabel.textContent = "Next";
  const nextName = document.createElement("span");
  nextName.dataset.nextName = "";
  nextName.className = "next-hint-name";
  nextEl.append(nextLabel, nextName);
  nextEl.hidden = true;

  // 工夫 reminder (bottom) — the child's saved note for this drill.
  const captionEl = document.createElement("div");
  captionEl.dataset.caption = "";
  captionEl.className = "kufu-caption";
  captionEl.textContent = "";

  // Control buttons (thumb-zone)
  const controls = document.createElement("div");
  controls.className = "training-controls";

  const PAUSE_LABEL = "⏸ 一時停止";
  const RESUME_LABEL = "▶ 再開";
  const pauseBtn = document.createElement("button");
  pauseBtn.dataset.pause = "";
  pauseBtn.className = "ctrl-btn pause-btn";
  pauseBtn.textContent = PAUSE_LABEL;

  const skipBtn = document.createElement("button");
  skipBtn.dataset.skip = "";
  skipBtn.className = "ctrl-btn skip-btn";
  skipBtn.textContent = "⏭ スキップ";

  const stopBtn = document.createElement("button");
  stopBtn.dataset.stop = "";
  stopBtn.className = "ctrl-btn stop-btn";
  stopBtn.textContent = "⏹ 終了";

  controls.append(pauseBtn, skipBtn, stopBtn);

  // Assemble the screen
  // The hook rows sit inside centerContent, right below the drill name/timer.
  centerContent.append(readHint, textGrid);

  // Alan's かざり over the camera, exactly where the export burns it.
  const decorEl = document.createElement("img");
  decorEl.dataset.decorPreview = decor;
  decorEl.className = `training-decor training-decor-${decor}`;
  decorEl.alt = "";
  decorEl.setAttribute("aria-hidden", "true");
  if (decor !== "none") decorEl.src = DECOR_SRC[decor];

  // 工夫 on the left, Next on the right: one row, so they can never overlap.
  const bottomRow = document.createElement("div");
  bottomRow.className = "training-bottom-row";
  bottomRow.append(captionEl, nextEl);

  root.append(dojoBg, videoEl, topBar, centerContent, cueEl, bottomRow,
              ...(decor === "none" ? [] : [decorEl]), controls);

  // One line when it can: step the font down a little before letting it wrap.
  // The 1px slack keeps WebKit's sub-pixel rounding from shrinking text that fits.
  const overflows = () => captionEl.scrollWidth > captionEl.clientWidth + 1;
  const fitCaption = () => {
    captionEl.style.fontSize = "";
    captionEl.style.whiteSpace = "";
    for (const rem of [0.92, 0.84, 0.76]) {
      if (!overflows()) return;
      captionEl.style.fontSize = `${rem}rem`;
    }
    if (overflows()) captionEl.style.whiteSpace = "normal";
  };

  // Setup state handlers
  let cueTimeout: ReturnType<typeof setTimeout> | null = null;

  const view: TrainingView = {
    videoEl,
    setDrill(drill: Drill, index: number, total: number) {
      drillEl.textContent = drill.name;
      // 休憩 is not a 種目, so a menu of nothing but rests has no count to show.
      progEl.textContent = total > 0 ? `${index} / ${total} 種目` : "";
    },
    setTime(secondsLeft: number) {
      timerEl.textContent = String(secondsLeft);
    },
    setTexts(grid: string[][] | null) {
      textGrid.textContent = "";
      const on = grid !== null && grid.some((line) => line.length > 0);
      readHint.hidden = !on;
      textGrid.hidden = !on;
      timerEl.hidden = on;   // no countdown while the hook plays
      // iOS WebKit sometimes keeps painting the composited hook layer after
      // `hidden` alone, leaving the words stuck over the practice. Taking the
      // nodes out of the document entirely drops that layer for good; they go
      // back in (same place, right under the drill name/timer) on the next hook.
      if (!on) {
        readHint.remove();
        textGrid.remove();
        return;
      }
      if (!textGrid.isConnected) centerContent.append(readHint, textGrid);
      grid!.forEach((words) => {
        const line = document.createElement("div");
        line.className = "text-grid-line";
        words.forEach((w) => {
          const pill = document.createElement("span");
          pill.className = "text-grid-word";
          pill.textContent = w;
          line.append(pill);
        });
        textGrid.append(line);
      });
    },
    revealText(index: number) {
      const pill = textGrid.querySelectorAll<HTMLElement>(".text-grid-word")[index];
      pill?.classList.add("show");
    },
    showCue(text: string): CheerClip | null {
      cueEl.textContent = text;
      if (text) cueEl.classList.add("show");

      // Pick a random companion and one of its phrase clips; the bubble shows
      // the words that clip says, so text and voice always match.
      const cheerId = CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
      const cheerInfo = CHARACTERS[cheerId] ?? CHARACTERS.alan;
      const clip = cheerInfo.cheerClips[Math.floor(Math.random() * cheerInfo.cheerClips.length)];
      if (!cheerVideo.src.endsWith(clip.src)) {
        cheerVideo.src = clip.src;
      }
      try { cheerVideo.currentTime = 0; } catch { /* jsdom / not ready */ }
      try {
        // jsdom's play() returns undefined and logs "not implemented"; guard it.
        void Promise.resolve(cheerVideo.play?.()).catch(() => { /* autoplay blocked */ });
      } catch { /* ignore synchronously throwing play() */ }
      speechBubble.textContent = `${cheerInfo.name}: ${clip.text}`;
      companionOverlay.classList.add("cheering");

      if (cueTimeout) clearTimeout(cueTimeout);
      cueTimeout = setTimeout(() => {
        cueEl.classList.remove("show");
        companionOverlay.classList.remove("cheering");
        cheerVideo.pause?.();
        cueTimeout = null;
      }, 2200);
      return clip;
    },
    setNext(text: string | null) {
      nextName.textContent = text ?? "";
      nextEl.hidden = !text;
    },
    setCaption(text: string) {
      // No 「工夫:」 prefix on screen: the pill is narrow beside Next and the
      // child knows what it is. The saved video still labels it 💡 工夫.
      captionEl.textContent = text;
      captionEl.classList.toggle("show", !!text);
      fitCaption();
    },
    setRecElapsed(text: string) {
      recEl.textContent = text;
    },
    setPaused(paused: boolean) {
      pauseBtn.textContent = paused ? RESUME_LABEL : PAUSE_LABEL;
    },
    setBgmMuted(muted: boolean) {
      bgmBtn.textContent = muted ? BGM_OFF_LABEL : BGM_ON_LABEL;
      bgmBtn.classList.toggle("muted", muted);
    },
    onPause(cb: () => void) {
      pauseBtn.addEventListener("click", cb);
    },
    onSkip(cb: () => void) {
      skipBtn.addEventListener("click", cb);
    },
    onStop(cb: () => void) {
      stopBtn.addEventListener("click", cb);
    },
    onToggleBgm(cb: () => void) {
      bgmBtn.addEventListener("click", cb);
    },
  };

  return view;
}
