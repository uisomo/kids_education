// おへや・かめん（SERIES_GUIDE 5.16）：ホームの「かくす」から ひらく カード。
//
// 子どもが じぶんで きりかえる（ゲートは いらない）。おうちの人が 家族タブで
// 「いつも オン／いつも オフ」に したものは ロックの しるしを 出して さわれない。
// 押すたびに onChange で 保存する（とじかたに かかわらず きえない）。

import { PRIVACY_MASKS, type PrivacyMask, type PrivacySettings } from "../alan/alan-privacy";
import { plainIcon } from "../alan/alan-icons.js";
import { modalHead } from "./modal-head";

export interface PrivacyModalDeps {
  /** いま 使う 値（おうちの人の 上書き ずみ） */
  settings: PrivacySettings;
  /** おうちの人が きめていて さわれない もの */
  locks: { room: boolean; face: boolean };
  /** おへやが いらない（もともと 人を 切りぬいている）アプリは false */
  roomAvailable?: boolean;
  onChange(settings: PrivacySettings): void;
  onClose?(): void;
}

export function maskSrc(mask: PrivacyMask): string {
  return `/alan/masks/${mask}.png`;
}

export function openPrivacyModal(host: HTMLElement, deps: PrivacyModalDeps): () => void {
  host.querySelectorAll("[data-privacy-modal]").forEach((el) => el.remove());
  let settings = { ...deps.settings };

  const overlay = document.createElement("div");
  overlay.className = "kufu-overlay privacy-modal-overlay";
  overlay.dataset.privacyModal = "";

  const card = document.createElement("div");
  card.className = "kufu-card privacy-modal-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "kufu-card-title";
  title.textContent = "どうがで かくす";

  const body = document.createElement("div");
  body.className = "privacy-modal-body";

  const paint = () => {
    body.replaceChildren();
    const rows: { key: "room" | "face"; name: string; hint: string }[] = [
      ...(deps.roomAvailable === false ? [] : [{ key: "room" as const, name: "おへや", hint: "うしろの へやを かくす" }]),
      { key: "face", name: "かめん", hint: "かおを かくす" },
    ];
    for (const row of rows) {
      const locked = deps.locks[row.key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "privacy-toggle" + (settings[row.key] ? " is-on" : "") + (locked ? " is-locked" : "");
      btn.dataset.privacyToggle = row.key;
      btn.disabled = locked;
      btn.setAttribute("aria-pressed", String(settings[row.key]));
      const text = document.createElement("span");
      text.className = "privacy-toggle-text";
      const name = document.createElement("span");
      name.className = "privacy-toggle-name";
      name.textContent = row.name;
      const hint = document.createElement("span");
      hint.className = "privacy-toggle-hint";
      hint.textContent = locked ? "おうちの人が きめています" : row.hint;
      text.append(name, hint);
      const state = document.createElement("span");
      state.className = "privacy-toggle-state";
      state.textContent = settings[row.key] ? "オン" : "オフ";
      btn.append(plainIcon(locked ? "lock" : settings[row.key] ? "check" : "close", "s"), text, state);
      btn.addEventListener("click", () => {
        settings = { ...settings, [row.key]: !settings[row.key] };
        deps.onChange(settings);
        paint();
      });
      body.append(btn);
    }

    // どの かめん（かめんが オンの ときだけ）
    if (settings.face) {
      const masks = document.createElement("div");
      masks.className = "privacy-masks";
      for (const m of PRIVACY_MASKS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "privacy-mask" + (settings.mask === m.id ? " is-on" : "");
        b.dataset.privacyMask = m.id;
        b.setAttribute("aria-label", `${m.name}の かめん`);
        const img = document.createElement("img");
        img.src = maskSrc(m.id);
        img.alt = "";
        const label = document.createElement("span");
        label.textContent = m.name;
        b.append(img, label);
        b.addEventListener("click", () => {
          settings = { ...settings, mask: m.id };
          deps.onChange(settings);
          paint();
        });
        masks.append(b);
      }
      body.append(masks);
    }
  };
  paint();

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.remove();
    deps.onClose?.();
  };
  const { head } = modalHead(title, close, "privacyModalClose");
  card.append(head, body);
  overlay.append(card);
  host.append(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  return close;
}
