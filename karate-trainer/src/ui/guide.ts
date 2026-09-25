// 初回ガイド「10びょう いっしょに録る」の見た目まわり。
//
// 使い方どうが（家族タブ）は「あとから調べる人」むけなので、入れたばかりの人には
// 読ませず、10秒の練習をひとつ用意して ①開始 ②保存 まで一緒にやってしまう。
// ここには 3つのかたまりだけ置く:
//   ・さそいカード  「10びょうで やってみる？」（「あとで」もある）
//   ・スポット      いま押すボタンを光らせて、👆 とひとこと出す
//   ・おしまいカード「これだけ！」
// 進行そのもの（どの段階か）は app.ts が持ち、状態の保存は guide-store.ts。

import type { Menu } from "../types";
import { COPY, IS_PIANO } from "../flavor";

// おためしの1種目。組み込みの 基本 メニューとは別もので、保存もしない
// （app.ts がメモリの上だけで差しかえ、ガイドが終わると元のメニューに戻す）。
export const GUIDE_SECONDS = 10;
export const GUIDE_DRILL_NAME = IS_PIANO ? "すきな音を ひく" : "パンチ";

export function guideMenu(): Menu {
  return [{ id: `guide-${Date.now()}`, name: GUIDE_DRILL_NAME, seconds: GUIDE_SECONDS, kind: "drill" }];
}

export interface GuideOfferDeps {
  onStart(): void;
  onLater(): void;
}

// 最初の一回だけ出るカード。ここで「やってみる」を選ぶと、10秒のおためしが
// 用意された 今日の稽古 に戻り、稽古 開始 が光る。
export function renderGuideOffer(host: HTMLElement, deps: GuideOfferDeps): () => void {
  host.querySelectorAll("[data-guide-offer]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "guide-overlay";
  overlay.dataset.guideOffer = "";

  const card = document.createElement("div");
  card.className = "guide-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "guide-card-title";
  title.textContent = "10びょうで やってみる？";

  const body = document.createElement("div");
  body.className = "guide-card-text";
  body.textContent = `おぼえることは 3つだけ。①メニューをえらぶ ②${COPY.practice} 開始 ③動画を保存。`
    + `いま 10びょうの おためしを 用意したので、いっしょに 保存まで やってみよう。`;

  const actions = document.createElement("div");
  actions.className = "guide-card-actions";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "guide-card-later";
  later.dataset.guideLater = "";
  later.textContent = "あとで";
  later.addEventListener("click", () => { close(); deps.onLater(); });

  const go = document.createElement("button");
  go.type = "button";
  go.className = "guide-card-go";
  go.dataset.guideStart = "";
  go.textContent = "やってみる ▶";
  go.addEventListener("click", () => { close(); deps.onStart(); });

  actions.append(later, go);
  card.append(title, body, actions);
  overlay.append(card);
  host.append(overlay);

  function close(): void { overlay.remove(); }
  return close;
}

// いま押すボタンを光らせて、そのすぐ上に 👆 とひとこと。ボタンは画面ごとに
// 作り直されるので、描いたあとに毎回これを呼び直す。
// anchor: ふきだしを置く相手（ふつうはボタンそのもの）。稽古 開始 のように
// すぐ上に別のスイッチが並んでいるところでは、その列ごと avoid したいので
// 列（.start-row）をわたす。
export function attachGuideSpot(
  host: HTMLElement, target: HTMLElement | null, text: string, anchor?: HTMLElement | null,
): void {
  host.querySelectorAll("[data-guide-tip]").forEach((el) => el.remove());
  host.querySelectorAll(".is-guide-spot").forEach((el) => el.classList.remove("is-guide-spot"));
  if (!target) return;

  target.classList.add("is-guide-spot");

  const tip = document.createElement("div");
  tip.className = "guide-tip";
  tip.dataset.guideTip = "";

  const hand = document.createElement("span");
  hand.className = "guide-tip-hand";
  hand.textContent = "👆";

  const words = document.createElement("span");
  words.className = "guide-tip-text";
  words.textContent = text;

  tip.append(words, hand);
  host.append(tip);

  // 光らせるボタンの真上に置く。レイアウトがまだ無いとき（テストなど）は
  // CSS の既定位置（画面の下のほう）のままにする。
  const place = () => {
    if (!tip.isConnected) return;
    const rect = (anchor ?? target).getBoundingClientRect();
    if (!rect.height) return;
    tip.style.top = `${Math.max(8, rect.top - tip.offsetHeight - 10)}px`;
  };
  place();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(place);
}

export function clearGuideSpot(host: HTMLElement): void {
  attachGuideSpot(host, null, "");
}

// 保存まで終わったときの「これだけ！」。次からは自分でできる、という確認。
export function renderGuideFinish(host: HTMLElement, onClose: () => void): () => void {
  host.querySelectorAll("[data-guide-finish]").forEach((el) => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "guide-overlay";
  overlay.dataset.guideFinish = "";

  const card = document.createElement("div");
  card.className = "guide-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  const title = document.createElement("div");
  title.className = "guide-card-title";
  title.textContent = "これだけ！";

  const list = document.createElement("ol");
  list.className = "guide-card-steps";
  [
    "メニューをえらぶ",
    `${COPY.practice} 開始 ▶ をおす`,
    "おわったら 動画を保存",
  ].forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  });

  const note = document.createElement("div");
  note.className = "guide-card-text";
  note.textContent = "つづきは 家族タブの「使い方どうが」でも 見られるよ。";

  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "guide-card-go";
  ok.dataset.guideDone = "";
  ok.textContent = "わかった！";
  ok.addEventListener("click", () => { overlay.remove(); onClose(); });

  const actions = document.createElement("div");
  actions.className = "guide-card-actions";
  actions.append(ok);

  card.append(title, list, note, actions);
  overlay.append(card);
  host.append(overlay);

  return () => overlay.remove();
}
