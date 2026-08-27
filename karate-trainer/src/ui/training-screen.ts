import type { Drill } from "../types";

export interface TrainingView {
  videoEl: HTMLVideoElement;
  setDrill(drill: Drill, index: number, total: number): void;
  setTime(secondsLeft: number): void;
  showCue(text: string): void;
  setNext(text: string | null): void;
  setRecElapsed(text: string): void;
  setPaused(paused: boolean): void;
  onPause(cb: () => void): void;
  onSkip(cb: () => void): void;
  onStop(cb: () => void): void;
}

export function renderTrainingScreen(root: HTMLElement): TrainingView {
  root.textContent = "";
  root.className = "screen training";

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

  topBar.append(recEl, progEl);

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
  root.append(videoEl, topBar, centerContent, cueEl, nextEl, controls);

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
      if (cueTimeout) clearTimeout(cueTimeout);
      cueTimeout = setTimeout(() => {
        cueEl.classList.remove("show");
        cueTimeout = null;
      }, 1600);
    },
    setNext(text: string | null) {
      if (text === null) {
        nextEl.textContent = "";
      } else {
        nextEl.textContent = text;
      }
    },
    setRecElapsed(text: string) {
      recEl.textContent = text;
    },
    setPaused(paused: boolean) {
      pauseBtn.textContent = paused ? RESUME_LABEL : PAUSE_LABEL;
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
  };

  return view;
}
