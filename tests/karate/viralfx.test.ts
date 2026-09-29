// @vitest-environment jsdom
// 🎬 えんしゅつ（SERIES_GUIDE 5.14）：録画の 前の ボタン、子どもごとの 保存。
import { it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";
import { scopedStorage } from "../../karate-trainer/src/scoped-storage";
import { loadViralFX, saveViralFX, VIRAL_FX_DEFAULT, VIRAL_FX_OFF } from "@alan/daily";

function deps(over: Record<string, unknown> = {}) {
  return {
    menu: structuredClone(DEFAULT_MENU), onChange: vi.fn(), onEdit: vi.fn(), onStart: vi.fn(),
    presets: [], onSavePreset: vi.fn(), onLoadPreset: vi.fn(), onDeletePreset: vi.fn(),
    ...over,
  };
}

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}

it("えんしゅつ ボタンは 稽古開始の 行に 出て、おすと パネルを ひらく", () => {
  const root = document.createElement("div");
  const onOpenViralFX = vi.fn();
  renderSetupScreen(root, deps({ onOpenViralFX, viralFxOn: true }));
  const btn = root.querySelector<HTMLButtonElement>("[data-start-row] [data-viralfx]")!;
  expect(btn.textContent).toContain("えんしゅつ");
  expect(btn.classList.contains("is-on")).toBe(true);
  btn.click();
  expect(onOpenViralFX).toHaveBeenCalledOnce();
});

it("ぜんぶ オフなら オフの 見た目、つなぎが なければ ボタンなし", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, deps({ onOpenViralFX: vi.fn(), viralFxOn: false }));
  expect(root.querySelector("[data-viralfx]")!.classList.contains("is-on")).toBe(false);
  renderSetupScreen(root, deps());
  expect(root.querySelector("[data-viralfx]")).toBeNull();
});

it("設定は 子どもごと（m:<id>:karate.viralfx）", () => {
  const base = memStorage();
  const a = scopedStorage(base, "a"), b = scopedStorage(base, "b");
  saveViralFX(a, "karate", VIRAL_FX_OFF);
  expect(base.getItem("m:a:karate.viralfx")).not.toBeNull();
  expect(loadViralFX(a, "karate")).toEqual(VIRAL_FX_OFF);
  expect(loadViralFX(b, "karate")).toEqual(VIRAL_FX_DEFAULT);
});
