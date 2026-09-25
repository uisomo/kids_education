// @vitest-environment jsdom
// おうちの人のロック: 親が決めた暗証番号と、Face ID / 指紋（Touch ID）の近道。
//
// なぜ暗証番号なのかは parent-lock-store.ts のコメントに書いたとおりで、iOS には
// 「画面の前にいるのが大人か」を判定する仕組みが無いから。生体認証が答えるのは
// 「この端末の持ち主か」までなので、近道は“親の端末”のときだけ立つ。
import { it, expect, vi, describe, beforeEach } from "vitest";
import { KarateApp, type KarateAppDeps } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import {
  getParentLock, setParentPin, setDeviceOwner, setParentBiometrics, checkPin, pinProblem,
} from "../../karate-trainer/src/parent-lock-store";
import {
  renderParentalGate, resetParentalGateLock, GATE_MAX_WRONG,
} from "../../karate-trainer/src/parental-gate";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const q = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-gate-question]")!;
const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>("[data-gate-input]")!;
const submit = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-gate-submit]")!;
const forgot = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-gate-forgot]")!;
const bio = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("[data-gate-biometrics]")!;

beforeEach(() => resetParentalGateLock());

describe("parent-lock-store", () => {
  it("only takes a 4〜8 digit number, full-width digits included", () => {
    const s = memStorage();
    expect(setParentPin("123", s)).toContain("桁");
    expect(setParentPin("123456789", s)).toContain("桁");
    expect(setParentPin("12ab", s)).toContain("数字");
    expect(getParentLock(s).pin).toBeNull();

    expect(setParentPin("４８２９", s)).toBeNull();   // 全角で決めても
    expect(checkPin("4829", s)).toBe(true);           // 半角で通る
    expect(checkPin("4820", s)).toBe(false);
    expect(pinProblem("4829")).toBeNull();
  });

  it("keeps the biometric shortcut off unless a PIN is set AND the phone is the parent's", () => {
    const s = memStorage();
    setParentBiometrics(true, s);
    expect(getParentLock(s).biometrics).toBe(false);   // 暗証番号がまだ無い

    setParentPin("4829", s);
    setParentBiometrics(true, s);
    expect(getParentLock(s).biometrics).toBe(false);   // 端末の持ち主が未回答

    setDeviceOwner("parent", s);
    setParentBiometrics(true, s);
    expect(getParentLock(s).biometrics).toBe(true);

    // 子どもの端末だと答えたら、近道はその場で下りる。
    setDeviceOwner("child", s);
    expect(getParentLock(s).biometrics).toBe(false);
  });

  it("drops the shortcut when the PIN is removed", () => {
    const s = memStorage();
    setParentPin("4829", s);
    setDeviceOwner("parent", s);
    setParentBiometrics(true, s);

    setParentPin(null, s);
    expect(getParentLock(s)).toEqual({ pin: null, owner: "parent", biometrics: false });
  });
});

describe("the gate with a PIN", () => {
  it("asks for the PIN instead of the multiplication, and hides it while typing", () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    renderParentalGate(root, { pin: "4829", onPass, onCancel: vi.fn() });

    expect(q(root).textContent).not.toContain("×");
    expect(input(root).type).toBe("password");

    input(root).value = "4828";
    submit(root).click();
    expect(onPass).not.toHaveBeenCalled();

    input(root).value = "４８２９";   // 全角でも通る
    submit(root).click();
    expect(onPass).toHaveBeenCalledOnce();
  });

  it("locks after three wrong PINs, like a wrong multiplication", () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    renderParentalGate(root, { pin: "4829", onPass, onCancel: vi.fn(), now: () => 1000 });

    for (let i = 0; i < GATE_MAX_WRONG; i++) {
      input(root).value = "0000";
      submit(root).click();
    }
    expect(submit(root).disabled).toBe(true);
    input(root).value = "4829";
    submit(root).click();
    expect(onPass).not.toHaveBeenCalled();
  });

  it("falls back to the multiplication when the parent forgot the PIN", () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    renderParentalGate(root, {
      pin: "4829", challenge: { a: 23, b: 4, answer: 92 }, onPass, onCancel: vi.fn(),
    });

    expect(forgot(root).hidden).toBe(false);
    forgot(root).click();

    const [a, b] = q(root).textContent!.match(/\d+/g)!.map(Number);
    expect(a * b).toBeGreaterThan(0);
    input(root).value = String(a * b);
    submit(root).click();
    expect(onPass).toHaveBeenCalledOnce();
  });

  it("shows no forgot link and no shortcut when there is no PIN (the old multiplication gate)", () => {
    const root = document.createElement("div");
    renderParentalGate(root, {
      onPass: vi.fn(), onCancel: vi.fn(),
      biometrics: { label: "Face ID", unlock: vi.fn().mockResolvedValue(true) },
    });
    expect(q(root).textContent).toContain("×");
    expect(forgot(root).hidden).toBe(true);
    expect(bio(root).hidden).toBe(true);
  });
});

describe("the Face ID / 指紋 shortcut", () => {
  it("asks the phone as soon as the gate opens and passes when it says yes", async () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    const unlock = vi.fn().mockResolvedValue(true);
    renderParentalGate(root, {
      pin: "4829", onPass, onCancel: vi.fn(), biometrics: { label: "指紋（Touch ID）", unlock },
    });

    expect(bio(root).textContent).toBe("指紋（Touch ID） でひらく");
    expect(unlock).toHaveBeenCalledOnce();
    await tick();
    expect(onPass).toHaveBeenCalledOnce();
  });

  it("falls back to the PIN box when the check fails or is cancelled", async () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    const unlock = vi.fn().mockResolvedValue(false);
    renderParentalGate(root, {
      pin: "4829", onPass, onCancel: vi.fn(), biometrics: { label: "Face ID", unlock },
    });
    await tick();
    expect(onPass).not.toHaveBeenCalled();

    input(root).value = "4829";
    submit(root).click();
    expect(onPass).toHaveBeenCalledOnce();

    // 押し直せる。
    bio(root).click();
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("survives a rejected check without passing the gate", async () => {
    const root = document.createElement("div");
    const onPass = vi.fn();
    renderParentalGate(root, {
      pin: "4829", onPass, onCancel: vi.fn(),
      biometrics: { label: "Face ID", unlock: vi.fn().mockRejectedValue(new Error("no sensor")) },
    });
    await tick();
    expect(onPass).not.toHaveBeenCalled();
    expect(bio(root).disabled).toBe(false);
  });
});

// --- 家族タブの前で、実際にどちらが立つか ---

const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

async function makeApp(over: Partial<KarateAppDeps> = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const storage = (over.storage as Storage | undefined) ?? memStorage();
  const store = new VoiceStore(memKv());
  await store.init();
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(new Blob(["v"])),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    storage,
    introStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
    ...over,
  });
  await app.start();
  await settle();
  const openFamily = async () => {
    root.querySelector<HTMLButtonElement>('[data-navtab="family"]')!.click();
    await settle();
  };
  return { root, storage, openFamily };
}

describe("the 家族 tab", () => {
  it("asks the parent's PIN once one is set, and the multiplication until then", async () => {
    const storage = memStorage();
    const first = await makeApp({ storage });
    await first.openFamily();
    expect(q(first.root).textContent).toContain("×");   // まだ暗証番号が無い

    setParentPin("4829", storage);
    const second = await makeApp({ storage });
    await second.openFamily();
    expect(q(second.root).textContent).not.toContain("×");

    input(second.root).value = "4829";
    submit(second.root).click();
    await settle();
    expect(second.root.querySelector("[data-parent-lock]")).not.toBeNull();
  });

  it("offers the shortcut only after the parent says the phone is theirs", async () => {
    const storage = memStorage();
    const authenticateParent = vi.fn().mockResolvedValue(true);
    const deps = { storage, authenticateParent, biometryKind: async () => "Face ID" };

    setParentPin("4829", storage);
    const a = await makeApp(deps);
    await a.openFamily();
    expect(bio(a.root).hidden).toBe(true);   // 端末の持ち主が未回答 → 近道なし
    input(a.root).value = "4829";
    submit(a.root).click();
    await settle();

    // 「おうちの人のもの」＋チェック → 次からは顔/指紋で開く。
    a.root.querySelector<HTMLInputElement>('[data-lock-owner-option="parent"]')!.click();
    await settle();
    a.root.querySelector<HTMLInputElement>("[data-lock-biometrics]")!.click();
    await settle();

    const b = await makeApp(deps);
    await b.openFamily();
    expect(authenticateParent).toHaveBeenCalledOnce();
    await settle();
    expect(b.root.querySelector("[data-parent-lock]")).not.toBeNull();
  });
});
