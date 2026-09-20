// Bottom tab bar: 特訓 / 積み重ね / 家族. Rendered as a standalone element that the
// app appends after a tab screen so it survives the screen's root.textContent
// reset. Hidden during training / loading / intro / done (full-screen capture).

export type NavTab = "train" | "strength" | "family";

export interface BottomNavDeps {
  active: NavTab;
  onSelect(tab: NavTab): void;
}

// 積み重ね carries drawn artwork (the rainbow stairs) rather than an emoji —
// 💪 read as "muscle / strength", which is the name the screen no longer uses.
const STRENGTH_ICON_SRC = "/images/nav-strength.png";

const TABS: { id: NavTab; label: string; icon: string; iconSrc?: string }[] = [
  { id: "train", label: "特訓", icon: "🥋" },
  { id: "strength", label: "積み重ね", icon: "🪜", iconSrc: STRENGTH_ICON_SRC },
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
    const icon = document.createElement("span");
    icon.className = "bottom-nav-icon";
    if (t.iconSrc) {
      // Decoration only — the label under it names the tab. If the artwork
      // can't be loaded the emoji takes its place rather than an empty gap.
      const img = document.createElement("img");
      img.className = "bottom-nav-icon-img";
      img.src = t.iconSrc;
      img.alt = "";
      img.addEventListener("error", () => { icon.textContent = t.icon; });
      icon.append(img);
    } else {
      icon.textContent = t.icon;
    }
    const label = document.createElement("span");
    label.className = "bottom-nav-label";
    label.textContent = t.label;
    btn.append(icon, label);
    btn.addEventListener("click", () => deps.onSelect(t.id));
    nav.append(btn);
  });

  return nav;
}
