// @vitest-environment jsdom
// 🎒 アイテム タブ — キラキラ・帯・ブロックの3つが 切り替えで出ること。
import { it, expect, vi, beforeEach } from "vitest";
import { renderItemScreen } from "../../karate-trainer/src/ui/item-screen";
import { MY_SPARKLES } from "../../karate-trainer/src/sparkle-store";
import { BLOCKS } from "../../karate-trainer/src/block-catalog";
import { setEarnedBelts } from "../../karate-trainer/src/belt-collection-store";
import { setPracticeCount } from "../../karate-trainer/src/block-store";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as Storage;
}

let root: HTMLElement;
let store: Storage;
beforeEach(() => {
  root = document.createElement("div");
  store = memStorage();
});

it("3つの切り替えを出し、はじめは キラキラ", () => {
  renderItemScreen(root, { storage: store });
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-item-tab]")];
  expect(tabs.map((t) => t.dataset.itemTab)).toEqual(["sparkle", "belt", "block"]);
  expect(root.querySelector("[data-item-tabs]")!.getAttribute("data-item-tabs")).toBe("sparkle");
  expect(root.querySelector("[data-sparkle-grid]")).not.toBeNull();
  expect(root.querySelector("[data-block-grid]")).toBeNull();
});

it("切り替えを押すと onSection が呼ばれる", () => {
  const onSection = vi.fn();
  renderItemScreen(root, { storage: store, onSection });
  root.querySelector<HTMLButtonElement>('[data-item-tab="block"]')!.click();
  expect(onSection).toHaveBeenCalledWith("block");
});

it("キラキラ: 持っているものは押せて、まだのものは 中身を見せない", () => {
  const onSelect = vi.fn();
  const starter = MY_SPARKLES.find((s) => s.tier === "start")!;
  const locked = MY_SPARKLES.find((s) => s.tier !== "start")!;
  renderItemScreen(root, { storage: store, onSelect, selectedId: starter.id });

  const owned = root.querySelector<HTMLElement>(`[data-sparkle="${starter.id}"]`)!;
  expect(owned.textContent).toContain(starter.name);
  expect(owned.classList.contains("selected")).toBe(true);
  (owned as HTMLButtonElement).click();
  expect(onSelect).toHaveBeenCalledWith(starter.id);

  const shut = root.querySelector<HTMLElement>(`[data-sparkle="${locked.id}"]`)!;
  expect(shut.textContent).toContain("？？？");
  expect(shut.textContent).not.toContain(locked.name);
});

it("帯: 本数・色ごとの数・その色のトロフィーを出す", () => {
  setEarnedBelts([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], store);
  renderItemScreen(root, { storage: store, section: "belt" });
  expect(root.querySelector("[data-belt-count]")!.textContent).toContain("11 本");
  // 白が10本 ＝ 白のトロフィーが2つ。
  expect(root.querySelector("[data-trophy-shelf]")!.getAttribute("data-trophy-shelf")).toBe("2");
  const white = root.querySelector<HTMLElement>('[data-belt="0"]')!;
  expect(white.textContent).toContain("×10");
  expect(white.dataset.beltTrophy ?? white.querySelector<HTMLElement>("[data-belt-trophy]")!.dataset.beltTrophy).toBe("2");
  // 1本だけの色も 数が出て、あと何本で トロフィーかを言う。
  const yellow = root.querySelector<HTMLElement>('[data-belt="1"]')!;
  expect(yellow.textContent).toContain("×1");
  expect(yellow.textContent).toContain("あと4本");
});

it("ブロック: 開いた絵だけ名前が出て、まだのものは 何回めかを言う", () => {
  setPracticeCount(BLOCKS[0].at, store);
  renderItemScreen(root, { storage: store, section: "block" });
  expect(root.querySelector("[data-block-count]")!.textContent).toContain(`1 / ${BLOCKS.length}`);

  const first = root.querySelector<HTMLElement>(`[data-block="${BLOCKS[0].id}"]`)!;
  expect(first.classList.contains("owned")).toBe(true);
  expect(first.textContent).toContain(BLOCKS[0].name);
  expect(first.querySelector("img")!.getAttribute("src")).toBe(BLOCKS[0].src);

  const next = root.querySelector<HTMLElement>(`[data-block="${BLOCKS[1].id}"]`)!;
  expect(next.classList.contains("locked")).toBe(true);
  expect(next.textContent).toContain("？？？");
  expect(next.textContent).toContain(`${BLOCKS[1].at}回め`);
  // つぎまで あと何回か。
  expect(root.querySelector("[data-block-hint]")!.textContent).toContain("あと 2回");
});
