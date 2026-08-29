import { CHARACTERS, type CharacterId } from "../character-store";

export type Expression = "normal" | "cheer";

export interface CompanionAvatarView {
  element: HTMLElement;
  setExpression(expr: Expression): void;
  setCharacter(id: CharacterId): void;
}

export function createCompanionAvatar(
  initialId: CharacterId = "alan",
  initialExpr: Expression = "normal",
  size: "small" | "medium" | "large" = "medium"
): CompanionAvatarView {
  const container = document.createElement("div");
  container.className = `toybox-avatar avatar-${size}`;

  const inner = document.createElement("div");
  inner.className = "avatar-inner";

  const imgNormal = document.createElement("img");
  imgNormal.className = "avatar-img img-normal";
  imgNormal.alt = "";

  const imgCheer = document.createElement("img");
  imgCheer.className = "avatar-img img-cheer hidden";
  imgCheer.alt = "";

  const starBadge = document.createElement("div");
  starBadge.className = "avatar-star-badge";
  starBadge.textContent = "⭐";

  inner.append(imgNormal, imgCheer, starBadge);
  container.append(inner);

  let currentId = initialId;
  let currentExpr = initialExpr;

  function update() {
    const info = CHARACTERS[currentId];
    if (!info) return;

    container.style.setProperty("--theme-color", info.themeColor);
    imgNormal.src = info.avatarNormal;
    imgCheer.src = info.avatarCheer;

    if (currentExpr === "cheer") {
      imgNormal.classList.add("hidden");
      imgCheer.classList.remove("hidden");
      container.classList.add("is-cheering");
    } else {
      imgCheer.classList.add("hidden");
      imgNormal.classList.remove("hidden");
      container.classList.remove("is-cheering");
    }
  }

  update();

  return {
    element: container,
    setExpression(expr: Expression) {
      currentExpr = expr;
      update();
    },
    setCharacter(id: CharacterId) {
      currentId = id;
      update();
    },
  };
}
