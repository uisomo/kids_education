// Ready → 3 → 2 → 1 → Go!! start intro.
//
// Renders a full-screen overlay on top of the (already visible) training
// screen and steps through the cues, one per `stepMs`. On each step it invokes
// `onBeat` so the caller can play a sound (beep / speech). The returned promise
// resolves after "Go!!" so the caller can then start the scheduler & BGM.
//
// stepMs = 0 makes the whole intro resolve on the next microtask with no
// visible delay — used by tests that pump the scheduler immediately.

export interface CountdownIntroOpts {
  stepMs?: number;
  onBeat?(cue: string): void;
}

const CUES = ["Ready", "3", "2", "1", "Go!!"];

export function playCountdownIntro(
  root: HTMLElement,
  opts: CountdownIntroOpts = {}
): Promise<void> {
  const stepMs = opts.stepMs ?? 700;

  const overlay = document.createElement("div");
  overlay.className = "countdown-intro";
  overlay.dataset.intro = "";

  const label = document.createElement("div");
  label.className = "countdown-intro-label";
  label.dataset.introLabel = "";
  overlay.append(label);
  root.append(overlay);

  return new Promise<void>((resolve) => {
    let i = 0;

    const finish = () => {
      overlay.remove();
      resolve();
    };

    const beat = () => {
      const cue = CUES[i];
      label.textContent = cue;
      label.classList.remove("pop");
      // force reflow so the pop animation restarts each beat
      void label.offsetWidth;
      label.classList.add("pop");
      if (cue === "Go!!") label.classList.add("go");
      opts.onBeat?.(cue);
      i++;

      if (i >= CUES.length) {
        if (stepMs <= 0) { finish(); return; }
        setTimeout(finish, stepMs);
        return;
      }
      if (stepMs <= 0) { beat(); return; }
      setTimeout(beat, stepMs);
    };

    beat();
  });
}
