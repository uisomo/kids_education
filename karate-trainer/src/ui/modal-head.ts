// カードの 頭：左上の ×（とじる）＋ まんなかに 名前（SERIES_GUIDE 5.15）。
// 下の「とじる」ボタンの かわりに どの カードも これを つかう。

import { iconButton } from "../alan/alan-icons.js";

// `dataKey` は × に つける data- の 名前（camelCase。例："kufuModalClose" → data-kufu-modal-close）。
export function modalHead(
  title: HTMLElement | null,
  onClose: () => void,
  dataKey: string,
): { head: HTMLDivElement; closeBtn: HTMLButtonElement } {
  const head = document.createElement("div");
  head.className = "modal-head";
  const closeBtn = iconButton("close", onClose);
  closeBtn.dataset[dataKey] = "";
  head.append(closeBtn);
  if (title) head.append(title);
  return { head, closeBtn };
}
