// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeChallenge, checkAnswer, renderParentalGate, askParentalGate, resetParentalGateLock,
  GATE_LOCK_MS,
} from "../../karate-trainer/src/parental-gate";

beforeEach(() => resetParentalGateLock());
afterEach(() => { vi.useRealTimers(); });

const q = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-gate-question]")!;
const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>("[data-gate-input]")!;
const submit = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-gate-submit]")!;
const err = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-gate-error]")!;

it("makeChallenge produces a two-digit × one-digit multiplication", () => {
  const seq = [0.5, 0.2];
  let i = 0;
  const c = makeChallenge(() => seq[i++]);
  expect(c.answer).toBe(c.a * c.b);
  expect(makeChallenge(() => 0)).toEqual({ a: 12, b: 3, answer: 36 });
  const hi = makeChallenge(() => 0.999999);
  expect(hi).toEqual({ a: 49, b: 9, answer: 441 });
  for (let n = 0; n < 200; n++) {
    const r = makeChallenge();
    expect(r.a).toBeGreaterThanOrEqual(12);
    expect(r.a).toBeLessThanOrEqual(49);
    expect(r.b).toBeGreaterThanOrEqual(3);
    expect(r.b).toBeLessThanOrEqual(9);
  }
});

it("checkAnswer accepts the correct product (ASCII or full-width) and rejects wrong/blank input", () => {
  const c = { a: 23, b: 4, answer: 92 };
  expect(checkAnswer(c, "92")).toBe(true);
  expect(checkAnswer(c, " 92 ")).toBe(true);
  expect(checkAnswer(c, "９２")).toBe(true);
  expect(checkAnswer(c, "93")).toBe(false);
  expect(checkAnswer(c, "")).toBe(false);
  expect(checkAnswer(c, "9e1")).toBe(false);
  expect(checkAnswer(c, "-92")).toBe(false);
});

it("renders a × question with a numeric input", () => {
  const root = document.createElement("div");
  renderParentalGate(root, { onPass: vi.fn(), onCancel: vi.fn(), challenge: { a: 12, b: 3, answer: 36 } });
  expect(q(root).textContent).toBe("12 × 3 = ?");
  expect(input(root).getAttribute("inputmode")).toBe("numeric");
});

it("calls onPass on a correct answer", () => {
  const root = document.createElement("div");
  const onPass = vi.fn();
  renderParentalGate(root, { onPass, onCancel: vi.fn(), challenge: { a: 12, b: 5, answer: 60 } });
  input(root).value = "60";
  submit(root).click();
  expect(onPass).toHaveBeenCalledOnce();
});

it("a wrong answer shows an error and swaps in a new question", () => {
  const root = document.createElement("div");
  const onPass = vi.fn();
  renderParentalGate(root, {
    onPass, onCancel: vi.fn(), challenge: { a: 12, b: 5, answer: 60 }, rand: () => 0,
  });
  input(root).value = "1";
  submit(root).click();
  expect(onPass).not.toHaveBeenCalled();
  expect(err(root).hidden).toBe(false);
  expect(q(root).textContent).toBe("12 × 3 = ?");   // new question from rand
  expect(input(root).value).toBe("");
  // The old answer no longer works.
  input(root).value = "60";
  submit(root).click();
  expect(onPass).not.toHaveBeenCalled();
  input(root).value = "36";
  submit(root).click();
  expect(onPass).toHaveBeenCalledOnce();
});

it("locks for 30 seconds after 3 wrong answers, then unlocks", () => {
  vi.useFakeTimers();
  let t = 1_000_000;
  const now = () => t;
  const root = document.createElement("div");
  const onPass = vi.fn();
  renderParentalGate(root, { onPass, onCancel: vi.fn(), rand: () => 0, now });
  for (let n = 0; n < 3; n++) {
    input(root).value = "0";
    submit(root).click();
  }
  expect(submit(root).disabled).toBe(true);
  expect(input(root).disabled).toBe(true);
  expect(err(root).textContent).toContain("30");
  // Even a correct answer is refused while locked.
  input(root).value = "36";
  submit(root).click();
  expect(onPass).not.toHaveBeenCalled();

  // Re-opening the gate doesn't bypass the lock.
  const again = document.createElement("div");
  renderParentalGate(again, { onPass, onCancel: vi.fn(), rand: () => 0, now });
  expect(submit(again).disabled).toBe(true);

  t += GATE_LOCK_MS;
  vi.advanceTimersByTime(1000);
  expect(submit(root).disabled).toBe(false);
  input(root).value = "36";
  submit(root).click();
  expect(onPass).toHaveBeenCalledOnce();
});

it("calls onCancel when cancel is pressed", () => {
  const root = document.createElement("div");
  const onCancel = vi.fn();
  renderParentalGate(root, { onPass: vi.fn(), onCancel, challenge: { a: 12, b: 3, answer: 36 } });
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
});

it("askParentalGate overlays without clearing root and resolves true on pass", async () => {
  const root = document.createElement("div");
  root.className = "screen setup";
  const existing = document.createElement("p");
  existing.textContent = "既存";
  root.append(existing);

  const p = askParentalGate(root, { challenge: { a: 12, b: 3, answer: 36 } });
  const overlay = root.querySelector<HTMLElement>("[data-gate-overlay]")!;
  expect(overlay).not.toBeNull();
  expect(root.contains(existing)).toBe(true);
  expect(root.className).toBe("screen setup");
  expect(overlay.querySelector(".gate")).not.toBeNull();

  input(overlay).value = "36";
  submit(overlay).click();
  await expect(p).resolves.toBe(true);
  expect(root.querySelector("[data-gate-overlay]")).toBeNull();
  expect(root.contains(existing)).toBe(true);
});

it("askParentalGate resolves false on cancel and removes the overlay", async () => {
  const root = document.createElement("div");
  const p = askParentalGate(root);
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  await expect(p).resolves.toBe(false);
  expect(root.querySelector("[data-gate-overlay]")).toBeNull();
});
