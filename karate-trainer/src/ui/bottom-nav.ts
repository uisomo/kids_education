// Bottom tab bar: 特訓 / アイテム / 積み重ね / 家族. Rendered as a standalone element that the
// app appends after a tab screen so it survives the screen's root.textContent
// reset. Hidden during training / loading / intro / done (full-screen capture).
//
// アイコンは シリーズ共通の グロッシー（src/alan/alan-icons.js、SERIES_GUIDE 5.2c）。
// えらんでいる タブだけ 意味の 色、ほかは グレー（tokens.css の .a-tab と おなじ 考え）。

import { type IconName, plainIcon } from "../alan/alan-icons.js";

export type NavTab = "train" | "sparkle" | "strength" | "family";

export interface BottomNavDeps {
  active: NavTab;
  onSelect(tab: NavTab): void;
}

const TABS: { id: NavTab; label: string; icon: IconName }[] = [
  { id: "train", label: "特訓", icon: "play" },
  // 「アイテム」の中に キラキラ・帯・ブロックが入る（tab の id は sparkle のまま:
  // 保存や test アプリの入口が この名前で通っている）。
  { id: "sparkle", label: "アイテム", icon: "gift" },
  { id: "strength", label: "積み重ね", icon: "chart" },
  { id: "family", label: "家族", icon: "family" },
];

export function createBottomNav(deps: BottomNavDeps): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.dataset.bottomNav = "";

  TABS.forEach((t) => {
    const active = t.id === deps.active;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bottom-nav-btn${active ? " active" : ""}`;
    btn.dataset.navtab = t.id;
    if (active) btn.setAttribute("aria-current", "page");
    // タブは わくが あるので 丸の 地なし（5.2c）
    const icon = plainIcon(t.icon, "m");
    icon.classList.add("bottom-nav-icon");
    const label = document.createElement("span");
    label.className = "bottom-nav-label";
    label.textContent = t.label;
    btn.append(icon, label);
    btn.addEventListener("click", () => deps.onSelect(t.id));
    nav.append(btn);
  });

  return nav;
}
