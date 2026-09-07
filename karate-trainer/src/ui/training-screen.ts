import type { Drill } from "../types";
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from "../character-store";

export interface TrainingView {
  videoEl: HTMLVideoElement;
  setDrill(drill: Drill, index: number, total: number): void;
  setTime(secondsLeft: number): void;
  showCue(text: string): void;
  setNext(text: string | null): void;
  setCaption(text: string): void;   // 工夫 reminder at the bottom
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
  characterId: CharacterId = "alan"
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

  const BGM_ON_LABEL = "🎵";
  const BGM_OFF_LABEL = "🔇";
  const bgmBtn = document.createElement("button");
  bgmBtn.dataset.bgmToggle = "";
  bgmBtn.className = "bgm-toggle-btn";
  bgmBtn.textContent = BGM_ON_LABEL;
  bgmBtn.setAttribute("aria-label", "BGM on/off");

  const progEl = document.createElement("div");
  progEl.dataset.prog = "";
  progEl.className = "prog";
  progEl.textContent = "";

  topBar.append(recEl, bgmBtn, progEl);

  // Companion cheer overlay: a transparent (green-screen removed) character
  // video that pops up in a corner on each cue, then hides. A random
  // character cheers each time — no partner selection anymore.
  const companionOverlay = document.createElement("div");
  companionOverlay.className = "companion-training-overlay";
  companionOverlay.dataset.companion = "";

  const cheerVideo = document.createElement("video");
  cheerVideo.className = "companion-cheer-video";
  cheerVideo.muted = true;
  cheerVideo.setAttribute("playsinline", "");
  cheerVideo.loop = true;

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

  centerContent.append(drillEl, timerEl);

  // Cue toast
  const cueEl = document.createElement("div");
  cueEl.dataset.cue = "";
  cueEl.className = "cue-toast";
  cueEl.textContent = "";

  // Next hint
  const nextEl = document.createElement("div");
  nextEl.dataset.next = "";
  nextEl.className = "next-hint";
  nextEl.textContent = "";

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
  root.append(dojoBg, videoEl, topBar, companionOverlay, centerContent, cueEl, nextEl, captionEl, controls);

  // Setup state handlers
  let cueTimeout: ReturnType<typeof setTimeout> | null = null;

  const view: TrainingView = {
    videoEl,
    setDrill(drill: Drill, index: number, total: number) {
      drillEl.textContent = drill.name;
      progEl.textContent = `${index} / ${total} 種目`;
    },
    setTime(secondsLeft: number) {
      timerEl.textContent = String(secondsLeft);
    },
    showCue(text: string) {
      cueEl.textContent = text;
      cueEl.classList.add("show");

      // Pick a random companion to cheer this time, load & play its
      // transparent clip, and show one of its quotes in the bubble.
      const cheerId = CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
      const cheerInfo = CHARACTERS[cheerId] ?? CHARACTERS.alan;
      if (!cheerVideo.src.endsWith(cheerInfo.cheerVideo)) {
        cheerVideo.src = cheerInfo.cheerVideo;
      }
      try { cheerVideo.currentTime = 0; } catch { /* jsdom / not ready */ }
      try {
        // jsdom's play() returns undefined and logs "not implemented"; guard it.
        void Promise.resolve(cheerVideo.play?.()).catch(() => { /* autoplay blocked */ });
      } catch { /* ignore synchronously throwing play() */ }
      const randomQuote = cheerInfo.quotes[Math.floor(Math.random() * cheerInfo.quotes.length)];
      speechBubble.textContent = `${cheerInfo.name}: ${randomQuote}`;
      companionOverlay.classList.add("cheering");

      if (cueTimeout) clearTimeout(cueTimeout);
      cueTimeout = setTimeout(() => {
        cueEl.classList.remove("show");
        companionOverlay.classList.remove("cheering");
        cheerVideo.pause?.();
        cueTimeout = null;
      }, 2200);
    },
    setNext(text: string | null) {
      if (text === null) {
        nextEl.textContent = "";
      } else {
        nextEl.textContent = text;
      }
    },
    setCaption(text: string) {
      captionEl.textContent = text ? `工夫: ${text}` : "";
      captionEl.classList.toggle("show", !!text);
    },
    setRecElapsed(text: string) {
      recEl.textContent = text;
    },
    setPaused(paused: boolean) {
      pauseBtn.textContent = paused ? RESUME_LABEL : PAUSE_LABEL;
    },
    setBgmMuted(muted: boolean) {
      bgmBtn.textContent = muted ? BGM_OFF_LABEL : BGM_ON_LABEL;
      bgmBtn.classList.toggle("is-muted", muted);
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
