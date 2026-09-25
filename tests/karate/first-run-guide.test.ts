// @vitest-environment jsdom
// 初回ガイド「10びょう いっしょに録る」: 入れたばかりの人に、①メニューをえらぶ
// ②稽古 開始 ③動画を保存 の3つを、10秒の練習を実際に録って保存するまで
// いっしょにやって見せる。
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { getActiveId } from "../../karate-trainer/src/member-store";
import { getHook } from "../../karate-trainer/src/hook-store";
import { loadMenu } from "../../karate-trainer/src/menu-store";
import {
  getGuide, shouldOfferGuide, markGuideDone, markGuideSkipped, resetGuide, MAX_SKIPS,
} from "../../karate-trainer/src/guide-store";
import { renderGuideOffer, attachGuideSpot, clearGuideSpot, guideMenu, GUIDE_SECONDS, GUIDE_DRILL_NAME } from "../../karate-trainer/src/ui/guide";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await tick(); };

interface Mounted { root: HTMLElement; loop(): ((d: number) => void) | null; share: ReturnType<typeof vi.fn>; }

async function mount(): Promise<Mounted> {
  const root = document.createElement("div");
  document.body.append(root);
  const store = new VoiceStore(memKv());
  await store.init();
  let loopCb: ((d: number) => void) | null = null;
  const share = vi.fn().mockResolvedValue(undefined);
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
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording: share,
    introStepMs: 0,
    hookStepMs: 0,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();
  return { root, loop: () => loopCb, share };
}

beforeEach(() => {
  localStorage.clear();
  document.body.textContent = "";
  (globalThis.URL as never as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as never as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

// --- guide-store ---------------------------------------------------------

it("offers the guide until it is finished, or 「あとで」 three times", () => {
  expect(shouldOfferGuide(localStorage)).toBe(true);
  for (let i = 0; i < MAX_SKIPS - 1; i++) markGuideSkipped(localStorage);
  expect(shouldOfferGuide(localStorage)).toBe(true);
  markGuideSkipped(localStorage);
  expect(shouldOfferGuide(localStorage)).toBe(false);

  resetGuide(localStorage);
  expect(shouldOfferGuide(localStorage)).toBe(true);
  markGuideDone(localStorage);
  expect(getGuide(localStorage).done).toBe(true);
  expect(shouldOfferGuide(localStorage)).toBe(false);
});

// --- the pieces on screen ------------------------------------------------

it("the card offers both 「やってみる」 and 「あとで」", () => {
  const host = document.createElement("div");
  const onStart = vi.fn();
  const onLater = vi.fn();
  renderGuideOffer(host, { onStart, onLater });
  expect(host.querySelector("[data-guide-offer]")).not.toBeNull();

  host.querySelector<HTMLButtonElement>("[data-guide-later]")!.click();
  expect(onLater).toHaveBeenCalled();
  expect(host.querySelector("[data-guide-offer]")).toBeNull();   // closes itself

  renderGuideOffer(host, { onStart, onLater });
  host.querySelector<HTMLButtonElement>("[data-guide-start]")!.click();
  expect(onStart).toHaveBeenCalled();
});

it("the spotlight lights one button at a time and comes off again", () => {
  const host = document.createElement("div");
  const a = document.createElement("button");
  const b = document.createElement("button");
  host.append(a, b);

  attachGuideSpot(host, a, "これを おしてね");
  expect(a.classList.contains("is-guide-spot")).toBe(true);
  expect(host.querySelector("[data-guide-tip]")!.textContent).toContain("これを おしてね");

  attachGuideSpot(host, b, "つぎは これ");
  expect(a.classList.contains("is-guide-spot")).toBe(false);
  expect(b.classList.contains("is-guide-spot")).toBe(true);
  expect(host.querySelectorAll("[data-guide-tip]")).toHaveLength(1);

  clearGuideSpot(host);
  expect(b.classList.contains("is-guide-spot")).toBe(false);
  expect(host.querySelector("[data-guide-tip]")).toBeNull();
});

it("the おためし menu is one drill of 10 seconds", () => {
  const menu = guideMenu();
  expect(menu).toHaveLength(1);
  expect(menu[0].seconds).toBe(GUIDE_SECONDS);
  expect(menu[0].kind).toBe("drill");
});

// --- the whole run, in the app -------------------------------------------

it("runs 開始 → 10びょう → 保存 and then says これだけ！", async () => {
  const { root, loop, share } = await mount();

  // 1. The card is there on the very first 今日の稽古.
  expect(root.querySelector("[data-guide-offer]")).not.toBeNull();
  root.querySelector<HTMLButtonElement>("[data-guide-start]")!.click();

  // 2. A 10-second おためし is ready and 稽古 開始 is lit — nothing to type.
  const rows = root.querySelectorAll("[data-row]");
  expect(rows).toHaveLength(1);
  expect(rows[0].querySelector<HTMLInputElement>(".drill-secs")!.value).toBe(String(GUIDE_SECONDS));
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;
  expect(start.classList.contains("is-guide-spot")).toBe(true);
  // 🪝 is on and on 「じどう」, so the words come by themselves.
  const mem = scopedStorage(localStorage, getActiveId(localStorage));
  expect(getHook(mem)).toMatchObject({ on: true, auto: true });
  // The おためし is never written over the member's own menu.
  expect(loadMenu(mem).some((d) => d.name === "前蹴り")).toBe(true);

  // 3. 開始 → the practice ends by itself after the 10 seconds.
  start.click();
  await settle();
  expect(loop()).toBeTypeOf("function");
  for (let t = 0; t < (GUIDE_SECONDS + 1) * 1000; t += 250) loop()!(250);
  await settle();

  // 4. On the done screen 「動画を保存」 is the lit one.
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl).not.toBeNull();
  expect(dl.classList.contains("is-guide-spot")).toBe(true);

  // 5. Saving finishes the guide: これだけ！, and it never asks again.
  dl.click();
  await settle();
  expect(share).toHaveBeenCalled();
  expect(root.querySelector("[data-guide-finish]")).not.toBeNull();
  expect(shouldOfferGuide(localStorage)).toBe(false);
  expect(root.querySelector("[data-guide-tip]")).toBeNull();

  root.querySelector<HTMLButtonElement>("[data-guide-done]")!.click();
  expect(root.querySelector("[data-guide-finish]")).toBeNull();
});

it("「あとで」 leaves the menu alone and asks again next launch", async () => {
  const { root } = await mount();
  root.querySelector<HTMLButtonElement>("[data-guide-later]")!.click();

  expect(root.querySelector("[data-guide-offer]")).toBeNull();
  expect(root.querySelector("[data-start]")!.classList.contains("is-guide-spot")).toBe(false);
  expect(getGuide(localStorage).skips).toBe(1);
  expect(shouldOfferGuide(localStorage)).toBe(true);

  // Same launch: it does not pop up again on the next render.
  root.querySelector<HTMLButtonElement>('[data-navtab="strength"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  expect(root.querySelector("[data-guide-offer]")).toBeNull();
});

it("leaving with もう一度 instead of saving keeps the guide for another day", async () => {
  const { root, loop } = await mount();
  root.querySelector<HTMLButtonElement>("[data-guide-start]")!.click();
  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await settle();
  for (let t = 0; t < (GUIDE_SECONDS + 1) * 1000; t += 250) loop()!(250);
  await settle();

  root.querySelector<HTMLButtonElement>("[data-again]")!.click();
  expect(root.querySelector("[data-guide-finish]")).toBeNull();
  expect(shouldOfferGuide(localStorage)).toBe(true);
  // The おためし is gone: the member's saved menu (基本) is back on the screen.
  const names = [...root.querySelectorAll<HTMLInputElement>("[data-row] .drill-name")].map((i) => i.value);
  expect(names).toEqual(loadMenu(scopedStorage(localStorage, getActiveId(localStorage))).map((d) => d.name));
  expect(names).not.toContain(GUIDE_DRILL_NAME);
});
