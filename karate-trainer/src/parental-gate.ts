export interface GateChallenge { a: number; b: number; answer: number }

// 大人向けの簡単な足し算。a,b は 2..9。rand は [0,1) を返す。
export function makeChallenge(rand: () => number = Math.random): GateChallenge {
  const a = 2 + Math.floor(rand() * 8);
  const b = 2 + Math.floor(rand() * 8);
  return { a, b, answer: a + b };
}

export function checkAnswer(challenge: GateChallenge, input: string): boolean {
  const n = Number(input.trim());
  if (input.trim() === "" || Number.isNaN(n)) return false;
  return n === challenge.answer;
}

export interface ParentalGateDeps {
  onPass(): void;
  onCancel(): void;
  challenge?: GateChallenge;
}

export function renderParentalGate(root: HTMLElement, deps: ParentalGateDeps): void {
  const challenge = deps.challenge ?? makeChallenge();
  root.textContent = "";
  root.className = "screen gate";

  const note = document.createElement("p");
  note.className = "gate-note";
  note.textContent = "おうちの人にわたしてね";

  const q = document.createElement("div");
  q.dataset.gateQuestion = "";
  q.className = "gate-question";
  q.textContent = `${challenge.a} + ${challenge.b} = ?`;

  const input = document.createElement("input");
  input.dataset.gateInput = "";
  input.setAttribute("inputmode", "numeric");
  input.type = "text";

  const err = document.createElement("div");
  err.dataset.gateError = "";
  err.className = "gate-error";
  err.hidden = true;
  err.setAttribute("role", "alert");
  err.textContent = "もう一度どうぞ";

  const submit = document.createElement("button");
  submit.dataset.gateSubmit = "";
  submit.className = "btn-gate-submit";
  submit.textContent = "OK";
  submit.addEventListener("click", () => {
    if (checkAnswer(challenge, input.value)) {
      deps.onPass();
    } else {
      err.hidden = false;
    }
  });

  const cancel = document.createElement("button");
  cancel.dataset.gateCancel = "";
  cancel.className = "btn-gate-cancel";
  cancel.textContent = "もどる";
  cancel.addEventListener("click", () => deps.onCancel());

  root.append(note, q, input, err, submit, cancel);
}
