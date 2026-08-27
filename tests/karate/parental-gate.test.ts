// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { makeChallenge, checkAnswer, renderParentalGate } from "../../karate-trainer/src/parental-gate";

it("makeChallenge produces a solvable addition with a matching answer", () => {
  // rand() sequence → deterministic a and b
  const seq = [0.5, 0.2];
  let i = 0;
  const c = makeChallenge(() => seq[i++]);
  expect(c.answer).toBe(c.a + c.b);
});

it("checkAnswer accepts the correct sum and rejects wrong/blank input", () => {
  const c = { a: 3, b: 4, answer: 7 };
  expect(checkAnswer(c, "7")).toBe(true);
  expect(checkAnswer(c, " 7 ")).toBe(true);
  expect(checkAnswer(c, "8")).toBe(false);
  expect(checkAnswer(c, "")).toBe(false);
});

it("renderParentalGate calls onPass only on a correct answer", () => {
  const root = document.createElement("div");
  const onPass = vi.fn();
  const onCancel = vi.fn();
  renderParentalGate(root, { onPass, onCancel, challenge: { a: 2, b: 5, answer: 7 } });

  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  const submit = root.querySelector<HTMLButtonElement>("[data-gate-submit]")!;

  input.value = "1";
  submit.click();
  expect(onPass).not.toHaveBeenCalled();
  expect(root.querySelector("[data-gate-error]")).not.toBeNull();

  input.value = "7";
  submit.click();
  expect(onPass).toHaveBeenCalledOnce();
});

it("renderParentalGate calls onCancel when cancel is pressed", () => {
  const root = document.createElement("div");
  const onCancel = vi.fn();
  renderParentalGate(root, { onPass: vi.fn(), onCancel, challenge: { a: 1, b: 1, answer: 2 } });
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
});
