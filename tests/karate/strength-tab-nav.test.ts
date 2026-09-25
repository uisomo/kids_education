// @vitest-environment jsdom
// 積み重ねタブで見るメニューを変えると、画面の下の3つのタブ（特訓／積み重ね／
// 家族）が消えてしまったバグ。画面じたいが root を作り直すので、画面の中から
// 描き直すと、あとから足したタブバーごと消えていた。
import { it, expect, vi, beforeEach } from "vitest";
import { KarateApp } from "../../karate-trainer/src/app";
import { VoiceStore, type KvAdapter } from "../../karate-trainer/src/voice-store";
import { savePreset } from "../../karate-trainer/src/preset-store";

function memKv(): KvAdapter {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k), entries: async () => [...m.entries()] };
}

async function mount(): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.append(root);
  const store = new VoiceStore(memKv());
  await store.init();
  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn(), beep: vi.fn(), speak: vi.fn() } as never,
    makeVideoRecorder: () => ({
      startCamera: vi.fn(), startRecording: vi.fn(), stop: vi.fn(), fileExtension: () => "mp4",
    }) as never,
    makeVoiceRecorder: () => ({ start: vi.fn(), stop: vi.fn() }) as never,
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: vi.fn(), stop: vi.fn() },
    shareRecording: vi.fn().mockResolvedValue(undefined),
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();
  return root;
}

beforeEach(() => {
  localStorage.clear();
  document.body.textContent = "";
});

it("keeps the bottom tabs when another menu is picked on 積み重ね", async () => {
  savePreset("型", [{ id: "k", name: "平安初段", seconds: 30, kind: "drill" }], localStorage, 5);
  const root = await mount();

  root.querySelector<HTMLButtonElement>('[data-navtab="strength"]')!.click();
  expect(root.querySelector("[data-bottom-nav]")).not.toBeNull();

  const select = root.querySelector<HTMLSelectElement>("[data-strength-menu]")!;
  select.value = [...select.options].find((o) => o.textContent === "型")!.value;
  select.dispatchEvent(new Event("change"));

  // The picked menu is showing AND the tabs are still there.
  const after = root.querySelector<HTMLSelectElement>("[data-strength-menu]")!;
  expect(after.selectedOptions[0].textContent).toBe("型");
  const nav = root.querySelector("[data-bottom-nav]");
  expect(nav).not.toBeNull();
  expect(nav!.querySelectorAll("[data-navtab]")).toHaveLength(3);
  expect(nav!.querySelector(".bottom-nav-btn.active")!.getAttribute("data-navtab")).toBe("strength");
  expect(root.classList.contains("has-bottom-nav")).toBe(true);

  // …and the tabs still work from there.
  root.querySelector<HTMLButtonElement>('[data-navtab="train"]')!.click();
  expect(root.querySelector("[data-start]")).not.toBeNull();
});
