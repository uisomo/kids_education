export interface GateChallenge { a: number; b: number; answer: number }

// 大人向けのかけ算（2けた × 1けた）。a は 12..49、b は 3..9。rand は [0,1) を返す。
// Apple の Kids カテゴリの保護者ゲートは「子どもには解けない」難度が要るため、
// 1けたの足し算からかけ算に引き上げている。
export function makeChallenge(rand: () => number = Math.random): GateChallenge {
  const pick = (min: number, max: number) =>
    min + Math.min(max - min, Math.max(0, Math.floor(rand() * (max - min + 1))));
  const a = pick(12, 49);
  const b = pick(3, 9);
  return { a, b, answer: a * b };
}

// Accepts ASCII or full-width digits (Japanese IME) and surrounding spaces.
export function normalizeDigits(input: string): string {
  return input
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
}

export function checkAnswer(challenge: GateChallenge, input: string): boolean {
  const s = normalizeDigits(input);
  if (!/^\d+$/.test(s)) return false;
  return Number(s) === challenge.answer;
}

export const GATE_MAX_WRONG = 3;
export const GATE_LOCK_MS = 30_000;

// Failure count and lock live at module level so a child can't dodge the lock
// by cancelling and reopening the gate.
let wrongCount = 0;
let lockedUntil = 0;

// Test hook: forget any accumulated wrong answers / active lock.
export function resetParentalGateLock(): void {
  wrongCount = 0;
  lockedUntil = 0;
}

export interface ParentalGateDeps {
  onPass(): void;
  onCancel(): void;
  // First question (tests). Later questions come from makeChallenge(rand).
  challenge?: GateChallenge;
  rand?: () => number;
  now?: () => number;
  // おうちの人が決めた暗証番号。設定されていれば、かけ算ではなくこれを聞く
  // ——「親が決めた、子どもが知らない秘密」だけが子の成長に負けないため。
  // 未設定（null / 省略）なら今まで通りのかけ算。
  pin?: string | null;
  // Face ID / 指紋（Touch ID）の近道。親が「この iPhone は自分のもの」と答えた
  // ときだけ渡される（子どもの端末では登録されている顔も指紋も子どものものなの
  // で、親ゲートにならない）。開いた瞬間に一度だけ自動で聞き、断られたり失敗
  // したりしたら黙って暗証番号に戻る。
  biometrics?: { label: string; unlock(): Promise<boolean> };
}

export function renderParentalGate(root: HTMLElement, deps: ParentalGateDeps): void {
  const rand = deps.rand ?? Math.random;
  const now = deps.now ?? (() => Date.now());
  let challenge = deps.challenge ?? makeChallenge(rand);
  // 暗証番号があるうちはそれを聞く。「わすれた」でかけ算に落ちる。
  let askingPin = !!deps.pin;
  root.textContent = "";
  root.className = "screen gate";

  const note = document.createElement("p");
  note.className = "gate-note";
  note.textContent = "ここから先は、おうちのひと専用だよ。おうちの人と相談してね。";

  const q = document.createElement("div");
  q.dataset.gateQuestion = "";
  q.className = "gate-question";

  const input = document.createElement("input");
  input.dataset.gateInput = "";
  input.type = "text";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("pattern", "[0-9]*");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-label", "こたえ");

  const err = document.createElement("div");
  err.dataset.gateError = "";
  err.className = "gate-error";
  err.hidden = true;
  err.setAttribute("role", "alert");

  const submit = document.createElement("button");
  submit.dataset.gateSubmit = "";
  submit.className = "btn-gate-submit";
  submit.textContent = "OK";

  const cancel = document.createElement("button");
  cancel.dataset.gateCancel = "";
  cancel.className = "btn-gate-cancel";
  cancel.textContent = "もどる";

  // 暗証番号をわすれたとき用。かけ算に切り替える（ここを残さないと、忘れた親は
  // アプリを消して入れ直す＝記録が全部消える、しか道がなくなる）。
  const forgot = document.createElement("button");
  forgot.dataset.gateForgot = "";
  forgot.className = "btn-gate-forgot";
  forgot.textContent = "あんしょうばんごうを わすれた";
  forgot.hidden = !askingPin;

  // Face ID / 指紋 のボタン。自動で一度聞いたあと、押し直せるように残す。
  const bio = document.createElement("button");
  bio.dataset.gateBiometrics = "";
  bio.className = "btn-gate-biometrics";
  bio.hidden = true;

  const showQuestion = () => {
    if (askingPin) {
      q.textContent = "🔒 おうちの人の あんしょうばんごう";
      input.type = "password";
      input.setAttribute("aria-label", "あんしょうばんごう");
    } else {
      q.textContent = `${challenge.a} × ${challenge.b} = ?`;
      input.type = "text";
      input.setAttribute("aria-label", "こたえ");
    }
    input.value = "";
  };

  let tick: ReturnType<typeof setInterval> | null = null;
  const stopTick = () => { if (tick !== null) { clearInterval(tick); tick = null; } };

  // Reflect the (module-level) lock in the UI; returns true while locked.
  const syncLock = (): boolean => {
    const remaining = lockedUntil - now();
    if (remaining > 0) {
      input.disabled = true;
      submit.disabled = true;
      bio.disabled = true;
      err.hidden = false;
      err.textContent = `${Math.ceil(remaining / 1000)}びょう まってから もう一度どうぞ`;
      if (tick === null) {
        tick = setInterval(() => {
          // The gate was replaced (re-render / overlay closed): stop ticking.
          if (!root.contains(submit)) { stopTick(); return; }
          syncLock();
        }, 1000);
      }
      return true;
    }
    stopTick();
    if (input.disabled) {
      input.disabled = false;
      submit.disabled = false;
      bio.disabled = false;
      err.hidden = true;
      err.textContent = "";
    }
    return false;
  };

  const pass = () => {
    wrongCount = 0;
    stopTick();
    deps.onPass();
  };

  const attempt = () => {
    if (syncLock()) return;
    const ok = askingPin
      ? normalizeDigits(input.value) === deps.pin
      : checkAnswer(challenge, input.value);
    if (ok) {
      pass();
      return;
    }
    wrongCount++;
    // かけ算は毎回作り直す（同じ問題を総当たりさせない）。
    if (!askingPin) challenge = makeChallenge(rand);
    showQuestion();
    if (wrongCount >= GATE_MAX_WRONG) {
      wrongCount = 0;
      lockedUntil = now() + GATE_LOCK_MS;
      syncLock();
      return;
    }
    err.hidden = false;
    err.textContent = askingPin ? "ちがいます" : "ちがいます。新しい問題です";
  };

  submit.addEventListener("click", attempt);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  cancel.addEventListener("click", () => { stopTick(); deps.onCancel(); });
  forgot.addEventListener("click", () => {
    askingPin = false;
    forgot.hidden = true;
    bio.hidden = true;
    err.hidden = true;
    err.textContent = "";
    challenge = makeChallenge(rand);
    showQuestion();
    input.focus();
  });

  showQuestion();
  root.append(note, q, input, err, submit, cancel, bio, forgot);
  const locked = syncLock();

  // 近道は暗証番号を聞いている間だけ（かけ算に落ちたあとは出さない）。
  if (deps.biometrics && askingPin) {
    const { label, unlock } = deps.biometrics;
    bio.textContent = `${label} でひらく`;
    bio.hidden = false;
    const ask = () => {
      if (syncLock()) return;
      bio.disabled = true;
      void Promise.resolve(unlock())
        .then((ok) => { if (ok && root.contains(bio)) pass(); })
        .catch(() => { /* 失敗したら暗証番号でどうぞ */ })
        .finally(() => { bio.disabled = false; });
    };
    bio.addEventListener("click", ask);
    // App Store の購入と同じで、開いた瞬間に一度だけ自動で聞く。
    if (!locked) ask();
  }
}

// Show the gate as an overlay appended to `root` (root's existing content is
// left alone). Resolves true on pass, false on cancel; the overlay is removed
// either way.
export function askParentalGate(
  root: HTMLElement,
  opts: Omit<ParentalGateDeps, "onPass" | "onCancel"> = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    root.querySelectorAll("[data-gate-overlay]").forEach((el) => el.remove());
    const overlay = document.createElement("div");
    overlay.className = "gate-overlay";
    overlay.dataset.gateOverlay = "";
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    overlay.append(panel);

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve(ok);
    };
    renderParentalGate(panel, { ...opts, onPass: () => finish(true), onCancel: () => finish(false) });
    root.append(overlay);
    panel.querySelector<HTMLInputElement>("[data-gate-input]")?.focus();
  });
}
