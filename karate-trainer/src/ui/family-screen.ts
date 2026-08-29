// 家族 screen — placeholder for Tower E (accounts, members, class assignment,
// upgrade/plans, parent 応援コメント). Full implementation comes later.

export interface FamilyDeps {
  storage?: Storage;
}

export function renderFamilyScreen(root: HTMLElement, _deps: FamilyDeps = {}): void {
  root.textContent = "";
  root.className = "screen family";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "家族";

  const soon = document.createElement("div");
  soon.className = "family-placeholder";
  soon.dataset.familyPlaceholder = "";
  soon.textContent = "近日公開：メンバー・クラス・応援コメント・アップグレード";

  root.append(title, soon);
}
