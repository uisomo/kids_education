import type { CheerClip } from "../character-store";
import type { Drill } from "../types";
import { icon, iconButton, type IconName } from "../alan/alan-icons.js";
import { CHARACTERS, CHARACTER_IDS, characterName, cheerClipsFor, type CharacterId } from "../character-store";
import { appLang, type Lang } from "../i18n";
import type { Decor } from "../decor-store";
import { hookPalette, hookFill, HOOK_COLOR_MODE } from "../hook-style";

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
  // `palette` picks the HOOK_PALETTES entry the words are painted in.
  setTexts(grid: string[][] | null, palette?: number, showAll?: boolean): void;
  // Reveal word #i (reading order) with the zoom-out animation.
  revealText(index: number): void;
  // 🪝 hook の「つづき」（SERIES_GUIDE 5.6）：読み上げの あいだ いつも 出ている
  // 手で すすめる ボタン。押すと いまの 待ちを すぐ おわらせる（画面だけ。動画には 出ない）。
  onHookSkip(cb: () => void): void;
  // Returns the cheer clip that started playing, or null.
  showCue(text: string): CheerClip | null;
  setNext(text: string | null): void;
  setCaption(text: string): void;   // 工夫 reminder at the bottom (text only; the video labels it)
  setRecElapsed(text: string): void;
  setBgmMuted(muted: boolean): void;
  // Piano only: the child taps 次へ / おわり when the piece is done.
  onPieceDone(cb: () => void): void;
  // 左上の × → 「やめる？」: onStopAsk when it opens, onStopCancel on つづける,
  // onStop on やめる (the session ends and the video is still saved).
  onStopAsk(cb: () => void): void;
  onStopCancel(cb: () => void): void;
  onStop(cb: () => void): void;
  onToggleBgm(cb: () => void): void;
}

export function renderTrainingScreen(
  root: HTMLElement,
  characterId: CharacterId = "alan",
  decor: Decor = "none",
  showBgm = true,
  // The piano app: no countdown on screen, and a 次へ button — the child
  // moves on when the piece is done (おわり on the last one).
  untimed = false,
  lang: Lang = appLang(),
): TrainingView {
  root.textContent = "";
  root.className = untimed ? "screen training untimed" : "screen training";

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

  // A button's words with a series icon (alan-icons) in front.
  // 色の こい ボタン（赤・緑）は 白い 絵、明るい 地（金・黄）は 墨色の 絵。どちらも 丸の 地なし（5.2c）。
  const label = (btn: HTMLElement, name: IconName | null, text: string, glossy = false): void => {
    btn.textContent = "";
    btn.classList.toggle("with-icon", !!name);
    if (name) btn.append(glossy ? icon(name, "ic", "dark") : icon(name));
    btn.append(text);
  };

  const bgmBtn = document.createElement("button");
  bgmBtn.dataset.bgmToggle = "";
  bgmBtn.className = "bgm-toggle-btn";
  label(bgmBtn, "sound", "BGM", true);
  bgmBtn.setAttribute("aria-label", "動画のBGM on/off。練習中はイヤフォンで聞けます");
  // No BGM player (the piano app): the button would switch nothing.
  bgmBtn.hidden = !showBgm;

  // やめる＝左上の ×（SERIES_GUIDE 5.15）。1回「やめる？」と きいてから おわる。
  const closeBtn = iconButton("close", () => askStop());
  closeBtn.dataset.trainingClose = "";
  closeBtn.classList.add("training-close");

  topBar.append(closeBtn, recEl, bgmBtn, progEl);

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
  timerEl.hidden = untimed;

  // The character pops up at a fixed spot at the right of the drill row. It
  // is not laid out with the name: a long 種目 pushed it off the screen, and
  // overlapping the name is fine.
  centerContent.append(drillEl, timerEl, companionOverlay);

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

  // 読み上げの あいだの「つづき」（SERIES_GUIDE 5.6）：時間だけで すすめず、
  // 読みおわったら 自分で 押して すすめる。画面の いちばん下（5.15）。live-only DOM。
  const hookSkips: Array<() => void> = [];
  const hookSkipBtn = document.createElement("button");
  hookSkipBtn.type = "button";
  hookSkipBtn.dataset.hookSkip = "";
  hookSkipBtn.className = "a-btn primary hook-skip-btn";
  hookSkipBtn.hidden = true;
  hookSkipBtn.addEventListener("click", () => hookSkips.forEach((cb) => cb()));

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

  // Piano only: 次へ (おわり on the last piece) — an untimed piece has no
  // other way to end. Karate drills end by time, so it has no button here.
  const NEXT_LABEL = "次へ";
  const LAST_LABEL = "おわり";
  const pieceBtn = document.createElement("button");
  pieceBtn.dataset.pieceDone = "";
  pieceBtn.className = "piece-done-btn";
  label(pieceBtn, "next", NEXT_LABEL);
  label(hookSkipBtn, "next", "つづき", true);
  const controls = document.createElement("div");
  controls.className = "training-controls";
  controls.append(pieceBtn);

  // 「やめる？」 sheet, built when × is tapped.
  const stopAsk: Array<() => void> = [];
  const stopCancel: Array<() => void> = [];
  const stopDone: Array<() => void> = [];
  let asking: HTMLElement[] | null = null;
  const closeAsk = () => { asking?.forEach((el) => el.remove()); asking = null; };
  const askStop = () => {
    if (asking) return;
    const scrim = document.createElement("div");
    scrim.className = "a-scrim";
    const sheet = document.createElement("div");
    sheet.className = "a-sheet training-stop-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.dataset.stopSheet = "";
    const title = document.createElement("h2");
    title.className = "a-h2";
    title.textContent = "やめる？";
    const sub = document.createElement("p");
    sub.className = "a-sub";
    sub.textContent = "ここまでの どうがは ほぞんするよ";
    const row = document.createElement("div");
    row.className = "training-stop-row";
    const stop = document.createElement("button");
    stop.type = "button";
    stop.dataset.stop = "";
    stop.className = "a-btn g-red";
    label(stop, "close", "やめる");
    const keep = document.createElement("button");
    keep.type = "button";
    keep.dataset.stopCancel = "";
    keep.className = "a-btn primary";
    label(keep, "play", "つづける", true);
    row.append(stop, keep);
    sheet.append(title, sub, row);
    const cancel = () => { if (!asking) return; closeAsk(); stopCancel.forEach((cb) => cb()); };
    scrim.addEventListener("click", cancel);
    keep.addEventListener("click", cancel);
    stop.addEventListener("click", () => { closeAsk(); stopDone.forEach((cb) => cb()); });
    asking = [scrim, sheet];
    root.append(scrim, sheet);
    stopAsk.forEach((cb) => cb());
  };

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
              ...(decor === "none" ? [] : [decorEl]), ...(untimed ? [controls] : []), hookSkipBtn);

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

  // On the phone the camera is a NATIVE preview layer behind a transparent web
  // view, so any pixel WebKit forgets to erase keeps showing over the live
  // picture for the rest of the practice. Taking the hook's nodes out of the
  // DOM was not enough on its own — a band of the words' red drop shadow stayed
  // in the middle of the screen. Nudging the screen's opacity for one frame
  // forces WebKit to re-rasterise the whole training layer, which clears it.
  // 0.996 is invisible, and the saved video is composed natively, so the frame
  // never reaches the recording.
  const raf: (cb: () => void) => unknown =
    typeof requestAnimationFrame === "function"
      ? (cb) => requestAnimationFrame(() => cb())
      : (cb) => setTimeout(cb, 16);
  const forceRepaint = () => {
    root.style.opacity = "0.996";
    void root.offsetHeight;      // flush the nudge before undoing it
    raf(() => {
      raf(() => {
        root.style.opacity = "";
      });
    });
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
    setTexts(grid: string[][] | null, palette = 0, showAll = false) {
      textGrid.textContent = "";
      const on = grid !== null && grid.some((line) => line.length > 0);
      readHint.hidden = !on;
      textGrid.hidden = !on;
      hookSkipBtn.hidden = !on;
      timerEl.hidden = on || untimed;   // no countdown while the hook plays
      // iOS WebKit sometimes keeps painting the composited hook layer after
      // `hidden` alone, leaving the words stuck over the practice. Taking the
      // nodes out of the document entirely drops that layer for good; they go
      // back in (same place, right under the drill name/timer) on the next hook.
      if (!on) {
        readHint.remove();
        textGrid.remove();
        // ...and repaint over where they were: removal alone left a sliver of
        // the last line behind (see forceRepaint). Once more a beat later, in
        // case the compositor had already committed the stale tile.
        forceRepaint();
        setTimeout(forceRepaint, 350);
        return;
      }
      if (!textGrid.isConnected) centerContent.append(readHint, textGrid);
      // Each practice gets its own colours (hook-style.ts) so two videos in a
      // row don't make the same thumbnail. The burned video paints the same
      // palette from the overlay log.
      const colors = hookPalette(palette);
      textGrid.style.setProperty("--hook-drop", colors.drop);
      grid!.forEach((words, row) => {
        const line = document.createElement("div");
        line.className = "text-grid-line";
        words.forEach((w) => {
          const pill = document.createElement("span");
          pill.className = "text-grid-word";
          if (showAll) pill.classList.add("show");
          if (HOOK_COLOR_MODE === "char") {
            // One span per character, so the colour can change inside a line.
            // The pill stays the reveal unit (revealText indexes pills).
            Array.from(w).forEach((ch, i) => {
              const glyph = document.createElement("span");
              glyph.className = "text-grid-char";
              glyph.textContent = ch;
              glyph.style.color = hookFill(colors, "char", row, i);
              pill.append(glyph);
            });
          } else {
            pill.textContent = w;
            pill.style.color = hookFill(colors, "line", row, 0);
          }
          line.append(pill);
        });
        textGrid.append(line);
      });
    },
    revealText(index: number) {
      const pill = textGrid.querySelectorAll<HTMLElement>(".text-grid-word")[index];
      pill?.classList.add("show");
      textGrid.querySelectorAll<HTMLElement>(".text-grid-word").forEach((word) => {
        word.style.textDecoration = word === pill ? "underline solid #e5243b 2px" : "none";
        word.style.textUnderlineOffset = "0.18em";
      });
    },
    showCue(text: string): CheerClip | null {
      cueEl.textContent = text;
      if (text) cueEl.classList.add("show");

      // Pick a random companion and one of its phrase clips; the bubble shows
      // the words that clip says, so text and voice always match.
      const cheerId = CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
      const cheerInfo = CHARACTERS[cheerId] ?? CHARACTERS.alan;
      const clips = cheerClipsFor(cheerInfo, lang);
      const clip = clips[Math.floor(Math.random() * clips.length)];
      if (!cheerVideo.src.endsWith(clip.src)) {
        cheerVideo.src = clip.src;
      }
      try { cheerVideo.currentTime = 0; } catch { /* jsdom / not ready */ }
      try {
        // jsdom's play() returns undefined and logs "not implemented"; guard it.
        void Promise.resolve(cheerVideo.play?.()).catch(() => { /* autoplay blocked */ });
      } catch { /* ignore synchronously throwing play() */ }
      speechBubble.textContent = `${characterName(cheerInfo, lang)}: ${clip.text}`;
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
      if (untimed) {
        if (text) label(pieceBtn, "next", NEXT_LABEL);
        else label(pieceBtn, "check", LAST_LABEL);
      }
    },
    setCaption(text: string) {
      // No 「工夫:」 prefix on screen: the pill is narrow beside Next and the
      // child knows what it is. The saved video still labels it 💡 工夫.
      if (captionEl.textContent === text) return;
      captionEl.textContent = text;
      captionEl.style.whiteSpace = "pre-line";
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        captionEl.animate?.([
          { transform: "translateX(12px) scale(1.18)", opacity: 0 },
          { transform: "translateX(0) scale(1)", opacity: 1 },
        ], { duration: 320, easing: "ease-out" });
      }
      captionEl.classList.toggle("show", !!text);
      fitCaption();
      captionEl.style.whiteSpace = "pre-line";
    },
    setRecElapsed(text: string) {
      recEl.textContent = text;
    },
    setBgmMuted(muted: boolean) {
      label(bgmBtn, muted ? "mute" : "sound", "BGM", true);
      bgmBtn.classList.toggle("muted", muted);
      bgmBtn.setAttribute("aria-pressed", String(!muted));
    },
    onHookSkip(cb: () => void) {
      hookSkips.push(cb);
    },
    onPieceDone(cb: () => void) {
      pieceBtn.addEventListener("click", cb);
    },
    onStopAsk(cb: () => void) { stopAsk.push(cb); },
    onStopCancel(cb: () => void) { stopCancel.push(cb); },
    onStop(cb: () => void) { stopDone.push(cb); },
    onToggleBgm(cb: () => void) {
      bgmBtn.addEventListener("click", cb);
    },
  };

  return view;
}
