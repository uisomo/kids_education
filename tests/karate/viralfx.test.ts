// @vitest-environment jsdom
// 🎬 えんしゅつ（SERIES_GUIDE 5.14）は 空手・ピアノでは つかわない（2026-09-30 uk：仕上げを 速く する ため）。
import { it, expect, vi } from "vitest";
import { renderSetupScreen } from "../../karate-trainer/src/ui/setup-screen";
import { DEFAULT_MENU } from "../../karate-trainer/src/menu-store";

it("録画の 前に えんしゅつ ボタンは 出ない", () => {
  const root = document.createElement("div");
  renderSetupScreen(root, {
    menu: structuredClone(DEFAULT_MENU), onChange: vi.fn(), onEdit: vi.fn(), onStart: vi.fn(),
    presets: [], onSavePreset: vi.fn(), onLoadPreset: vi.fn(), onDeletePreset: vi.fn(),
  });
  expect(root.querySelector("[data-viralfx]")).toBeNull();
  expect(root.textContent).not.toContain("えんしゅつ");
});
