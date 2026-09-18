// Bottom tab bar: 特訓 / 強さ / 家族. Rendered as a standalone element that the
// app appends after a tab screen so it survives the screen's root.textContent
// reset. Hidden during training / loading / intro / done (full-screen capture).

import { COPY } from "../flavor";

export type NavTab = "train" | "strength" | "family";

export interface BottomNavDeps {
  active: NavTab;
  onSelect(tab: NavTab): void;
}

const TABS: { id: NavTab; label: string; icon: string }[] = [
  { id: "train", label: "特訓", icon: COPY.drillIcon },
  { id: "strength", label: "強さ", icon: "💪" },
  { id: "family", label: "家族", icon: "👨‍👩‍👧" },
];

export function createBottomNav(deps: BottomNavDeps): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.dataset.bottomNav = "";

  TABS.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bottom-nav-btn${t.id === deps.active ? " active" : ""}`;
    btn.dataset.navtab = t.id;
    btn.innerHTML = `<span class="bottom-nav-icon">${t.icon}</span><span class="bottom-nav-label">${t.label}</span>`;
    btn.addEventListener("click", () => deps.onSelect(t.id));
    nav.append(btn);
  });

  return nav;
}
