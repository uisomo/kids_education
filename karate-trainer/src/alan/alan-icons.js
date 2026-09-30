// アランの シリーズ 共通の アイコン（SERIES_GUIDE 5.2c・5.15）
// - 正本は ここ。アプリへは sync_brand.py で コピー（手で直さない）
// - 1つの 意味に 1つの アイコン。絵文字で 代わりに しない
// - 色は「意味の 色」（ICONS の color）。アプリの --brand とは べつ
// - 絵は ChatGPT で 作った PNG（下の BASE。作り方は art_src/）。svg は 予備
// - 見た目の 骨組みは brand/tokens.css（.gicon .gicon-img）。見本は brand/preview.html
// - Swift（ことばクラッシュ・AlanKit）は ios/AlanKit の GlossyIcon.swift に おなじ 名前・色が ある。
//   ここを 変えたら そちらも（`python3 brand/sync_brand.py --check` で しらべる）
//
// 使い方（Vite / TS）：
//   import { glossyIcon, icon } from "./alan/alan-icons.js";
//   button.prepend(glossyIcon("play"));            // 意味の 色（cyan）
//   button.prepend(glossyIcon("check", "l"));      // 大きさ s / m / l / xl
//   button.prepend(glossyIcon("star", "m", "pink")); // 色を かえる（まれ。理由が あるときだけ）
// 使い方（おかね：www/index.html）：
//   <script type="module"> import { glossyIcon } from "./alan/alan-icons.js"; ... </script>

const S = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"';

/**
 * 意味 → 絵・色・よみ。ここに ない 意味の アイコンを アプリで 作らない（足すなら ここに 足す）。
 * color は tokens.css の .g-<color>。
 */
export const ICONS = {
  // ── 道（ナビゲーション 5.15） ──
  back:     { color: "white",  label: "もどる",   svg: `<path d="M14.5 5.5 8 12l6.5 6.5" ${S} stroke-width="3.4"/>` },
  close:    { color: "white",  label: "とじる",   svg: `<path d="M7 7l10 10M17 7 7 17" ${S} stroke-width="3.4"/>` },
  next:     { color: "green",  label: "つぎへ",   svg: `<path d="M9.5 5.5 16 12l-6.5 6.5" ${S} stroke-width="3.4"/>` },
  home:     { color: "blue",   label: "ホーム",   svg: `<path d="M3.8 11.2 12 4.2l8.2 7" ${S} stroke-width="2.6"/><path d="M6.2 10.4V19a1.4 1.4 0 0 0 1.4 1.4h2.9v-5.2h3v5.2h2.9a1.4 1.4 0 0 0 1.4-1.4v-8.6L12 5.6z" fill="currentColor"/>` },
  // ── する こと ──
  play:     { color: "cyan",   label: "はじめる", svg: `<path d="M8.4 6.2l9.8 5.8-9.8 5.8z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` },
  record:   { color: "red",    label: "ろくが",   svg: `<circle cx="12" cy="12" r="6.4" fill="currentColor"/>` },
  camera:   { color: "red",    label: "カメラ",   svg: `<path d="M4 8.6A2 2 0 0 1 6 6.6h1.8l1.3-2h5.8l1.3 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor"/><circle cx="12" cy="12.6" r="3.3" fill="rgba(0,0,0,.28)"/>` },
  again:    { color: "cyan",   label: "もういちど", svg: `<path d="M18.4 12a6.4 6.4 0 1 1-2-4.7" ${S} stroke-width="2.8"/><path d="M17.4 3.8v4.4H13" ${S} stroke-width="2.8"/>` },
  pause:    { color: "cyan",   label: "とめる",   svg: `<rect x="6.2" y="5" width="4.2" height="14" rx="1.8" fill="currentColor"/><rect x="13.6" y="5" width="4.2" height="14" rx="1.8" fill="currentColor"/>` },
  random:   { color: "orange", label: "おまかせ", svg: `<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" fill="currentColor"/><g fill="rgba(0,0,0,.26)"><circle cx="8" cy="8" r="1.9"/><circle cx="16" cy="8" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="8" cy="16" r="1.9"/><circle cx="16" cy="16" r="1.9"/></g>` },
  share:    { color: "blue",   label: "おくる",   svg: `<path d="M12 14.5V4.2M8 7.8l4-4 4 4" ${S} stroke-width="2.8"/><path d="M6.5 11.5v6.3a1.6 1.6 0 0 0 1.6 1.6h7.8a1.6 1.6 0 0 0 1.6-1.6v-6.3" ${S} stroke-width="2.6"/>` },
  save:     { color: "blue",   label: "ほぞん",   svg: `<path d="M12 4v10.4M8 10.6l4 4 4-4" ${S} stroke-width="2.8"/><path d="M5.5 16.5v1.8a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-1.8" ${S} stroke-width="2.6"/>` },
  add:      { color: "green",  label: "ふやす",   svg: `<path d="M12 5.5v13M5.5 12h13" ${S} stroke-width="3.4"/>` },
  // ── できた・ごほうび（5.9） ──
  check:    { color: "green",  label: "できた",   svg: `<path d="M5 12.5l4.5 4.5L19 7.5" ${S} stroke-width="3.4"/>` },
  star:     { color: "yellow", label: "ほし",     svg: `<path d="M12 3.4l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.3 6.1-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>` },
  flame:    { color: "orange", label: "つづけた日", svg: `<path d="M12 21.4c3.6 0 6.4-2.6 6.4-6.1 0-4.6-4.3-7.3-6.4-13-2.1 5.7-6.4 8.4-6.4 13 0 3.5 2.8 6.1 6.4 6.1z" fill="currentColor"/><path d="M12 19.2c1.6 0 2.8-1.1 2.8-2.7 0-2-1.8-3.2-2.8-5.6-1 2.4-2.8 3.6-2.8 5.6 0 1.6 1.2 2.7 2.8 2.7z" fill="rgba(0,0,0,.18)"/>` },
  gift:     { color: "yellow", label: "たからもの", svg: `<rect x="4" y="9" width="16" height="11" rx="2.4" fill="currentColor"/><rect x="3" y="6.4" width="18" height="4.2" rx="1.8" fill="currentColor"/><path d="M12 6.4V20" stroke="rgba(0,0,0,.24)" stroke-width="2.4"/><path d="M12 6.4c-1.6-3.4-5.4-3-4.6-.6.5 1.4 4.6.6 4.6.6zm0 0c1.6-3.4 5.4-3 4.6-.6-.5 1.4-4.6.6-4.6.6z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` },
  new:      { color: "pink",   label: "あたらしい", svg: `<path d="M12 2.8l2.2 4.6 5-1.6-1.6 5 4.6 2.2-4.6 2.2 1.6 5-5-1.6L12 21.2l-2.2-4.6-5 1.6 1.6-5L1.8 11l4.6-2.2-1.6-5 5 1.6z" fill="currentColor"/>` },
  // ── きろく ──
  film:     { color: "blue",   label: "きろく",   svg: `<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="3.2" fill="currentColor"/><path d="M10 9.4v5.2l4.4-2.6z" fill="rgba(0,0,0,.3)"/>` },
  chart:    { color: "blue",   label: "せいせき", svg: `<rect x="4.4" y="12" width="4" height="7.6" rx="1.8" fill="currentColor"/><rect x="10" y="7.4" width="4" height="12.2" rx="1.8" fill="currentColor"/><rect x="15.6" y="4" width="4" height="15.6" rx="1.8" fill="currentColor"/>` },
  // ── ひと・家族（5.7・5.12） ──
  child:    { color: "purple", label: "こども",   svg: `<circle cx="12" cy="7.6" r="3.9" fill="currentColor"/><path d="M4.6 20.4c0-4 3.3-6.6 7.4-6.6s7.4 2.6 7.4 6.6z" fill="currentColor"/>` },
  family:   { color: "purple", label: "おうちの人", svg: `<circle cx="8.6" cy="7.4" r="3.3" fill="currentColor"/><circle cx="16.4" cy="9.6" r="2.6" fill="currentColor"/><path d="M2.6 19.8c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="currentColor"/><path d="M13.6 19.8c.2-2.3 1.3-4 3-4.4 2.6.1 4.6 1.9 4.8 4.4z" fill="currentColor"/>` },
  // ── ことば・きく ──
  letter:   { color: "pink",   label: "てがみ",   svg: `<rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2.8" fill="currentColor"/><path d="M4.4 7.2 12 12.8l7.6-5.6" stroke="rgba(0,0,0,.26)" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
  idea:     { color: "yellow", label: "くふう",   svg: `<path d="M12 3.2a6.2 6.2 0 0 0-3.6 11.3c.6.5 1 1.1 1 1.9v.6h5.2v-.6c0-.8.4-1.4 1-1.9A6.2 6.2 0 0 0 12 3.2z" fill="currentColor"/><rect x="9.4" y="18" width="5.2" height="2.8" rx="1.3" fill="currentColor"/>` },
  mic:      { color: "red",    label: "はなす",   svg: `<rect x="8.6" y="2.8" width="6.8" height="11.4" rx="3.4" fill="currentColor"/><path d="M5.6 11a6.4 6.4 0 0 0 12.8 0" ${S} stroke-width="2.4"/><path d="M12 17.4v3M8.6 20.6h6.8" ${S} stroke-width="2.4"/>` },
  headphones: { color: "cyan", label: "イヤホン", svg: `<path d="M4.6 15v-2.6a7.4 7.4 0 0 1 14.8 0V15" ${S} stroke-width="2.6"/><rect x="3.4" y="13.2" width="5" height="7" rx="2.2" fill="currentColor"/><rect x="15.6" y="13.2" width="5" height="7" rx="2.2" fill="currentColor"/>` },
  trash:    { color: "grey",   label: "けす",     svg: `<path d="M4.6 6.8h14.8" ${S} stroke-width="2.6"/><path d="M9.4 6.4V4.6h5.2v1.8" ${S} stroke-width="2.2"/><path d="M6.4 8.6h11.2l-.9 10.4a1.6 1.6 0 0 1-1.6 1.4H8.9a1.6 1.6 0 0 1-1.6-1.4z" fill="currentColor"/>` },
  // ── せってい・まもる ──
  lock:     { color: "grey",   label: "ロック",   svg: `<path d="M8.4 10.2V8.2a3.6 3.6 0 017.2 0v2" ${S} stroke-width="2.4"/><rect x="4.75" y="10" width="14.5" height="10" rx="3.4" fill="currentColor"/>` },
  settings: { color: "grey",   label: "せってい", svg: `<path d="M10.3 2.8h3.4l.5 2.5 1.7.9 2.4-.9 1.7 2.9-1.9 1.7v2l1.9 1.7-1.7 2.9-2.4-.9-1.7.9-.5 2.5h-3.4l-.5-2.5-1.7-.9-2.4.9-1.7-2.9 1.9-1.7v-2L4 8.2l1.7-2.9 2.4.9 1.7-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="11.9" r="2.8" fill="rgba(0,0,0,.28)"/>` },
  sound:    { color: "cyan",   label: "おと",     svg: `<path d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.4 9a4.2 4.2 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" ${S} stroke-width="2.4"/>` },
  mute:     { color: "grey",   label: "おと なし", svg: `<path d="M4 9.4h3.4L12 5.4v13.2l-4.6-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.6 9.4l5 5M20.6 9.4l-5 5" ${S} stroke-width="2.4"/>` },
  help:     { color: "blue",   label: "あそびかた", svg: `<path d="M9 9.2a3 3 0 1 1 4.4 2.7c-.9.5-1.4 1.1-1.4 2.1v.6" ${S} stroke-width="2.8"/><circle cx="12" cy="18.2" r="1.7" fill="currentColor"/>` },
  sparkle:  { color: "pink",   label: "えんしゅつ", svg: `<path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7z" fill="currentColor"/><path d="M17.5 13.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" fill="currentColor"/>` },
  // ── 考え方の 道具（アランの解決。PLAN 1章） ──
  frame:    { color: "red",    label: "ほんとうの もんだい", svg: `<circle cx="12" cy="12" r="8" ${S} stroke-width="2.6"/><circle cx="12" cy="12" r="4.4" ${S} stroke-width="2.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>` },
  why:      { color: "blue",   label: "なぜを ほる", svg: `<circle cx="10.4" cy="10.4" r="5.4" ${S} stroke-width="2.8"/><path d="M14.6 14.6l5 5" ${S} stroke-width="3.2"/>` },
  split:    { color: "orange", label: "わけてみる", svg: `<path d="M5 9h3.2a2.2 2.2 0 1 1 4.4 0H16v3.4a2.2 2.2 0 1 1 0 4.4V20H5z" fill="currentColor"/>` },
  empathy:  { color: "pink",   label: "その人に なる", svg: `<path d="M12 20.2s-7.6-4.6-7.6-10a4.2 4.2 0 0 1 7.6-2.5 4.2 4.2 0 0 1 7.6 2.5c0 5.4-7.6 10-7.6 10z" fill="currentColor"/>` },
  system:   { color: "purple", label: "つながり", svg: `<path d="M12 5.6 5.6 17.4h12.8z" ${S} stroke-width="2.2"/><circle cx="12" cy="5.6" r="2.6" fill="currentColor"/><circle cx="5.6" cy="17.4" r="2.6" fill="currentColor"/><circle cx="18.4" cy="17.4" r="2.6" fill="currentColor"/>` },
  diverge:  { color: "yellow", label: "アイデアを たくさん", svg: `<path d="M12 20v-9M12 11 7 6M12 11l5-5M12 11V4" ${S} stroke-width="2.6"/>` },
  decide:   { color: "green",  label: "えらぶ", svg: `<path d="M12 4v15M6 7h12M8.6 19.4h6.8" ${S} stroke-width="2.4"/><path d="M3.4 12.6 6 7l2.6 5.6zM15.4 12.6 18 7l2.6 5.6z" fill="currentColor"/>` },
  future:   { color: "cyan",   label: "そのあと", svg: `<circle cx="12" cy="10.4" r="6.4" fill="currentColor"/><path d="M7.4 19.6h9.2l-1.2-3H8.6z" fill="currentColor"/>` },
  experiment: { color: "green", label: "ためす", svg: `<path d="M10 3.6h4M10.6 3.6v5.2L6 17a2.4 2.4 0 0 0 2.1 3.4h7.8A2.4 2.4 0 0 0 18 17l-4.6-8.2V3.6" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` },
  situation: { color: "grey",  label: "どんな もんだい", svg: `<circle cx="12" cy="12" r="8.2" ${S} stroke-width="2.4"/><path d="M12 5.8l1.6 4.6 4.6 1.6-4.6 1.6-1.6 4.6-1.6-4.6-4.6-1.6 4.6-1.6z" fill="currentColor"/>` },
  // ── ディベートの わざ（アランのディベート。PLAN 1章。Issue Tree＝split・Weighing＝decide は 上の ものを つかう） ──
  prep:     { color: "orange", label: "サンドイッチで 話す", svg: `<rect x="4" y="5" width="16" height="4.4" rx="2.2" fill="currentColor"/><rect x="4" y="10.4" width="16" height="3" rx="1.5" fill="currentColor"/><rect x="4" y="14.6" width="16" height="4.4" rx="2.2" fill="currentColor"/>` },
  claim:    { color: "red",    label: "しょうこで ささえる", svg: `<path d="M6 21V4" ${S} stroke-width="2.6"/><path d="M6.8 4.6c3-1.4 5.4 1.6 11.6 0v8.2c-6.2 1.6-8.6-1.4-11.6 0z" fill="currentColor"/>` },
  ladder:   { color: "yellow", label: "しょうこの はしご", svg: `<path d="M8 3.5v17M16 3.5v17M8 7.5h8M8 12h8M8 16.5h8" ${S} stroke-width="2.4"/>` },
  persuade: { color: "pink",   label: "3つの ちから", svg: `<path d="M12 12V3.6A8.4 8.4 0 0 1 19.3 16.2z" fill="currentColor"/><path d="M11.2 12.8 18.5 17A8.4 8.4 0 0 1 4 16.9z" fill="currentColor"/><path d="M11 11.6 3.6 15.9A8.4 8.4 0 0 1 11 3.6z" fill="currentColor"/>` },
  bridge:   { color: "blue",   label: "ささえの 6ピース", svg: `<path d="M3 17c3-6 15-6 18 0" ${S} stroke-width="2.8"/><path d="M5 12.6V19M19 12.6V19" ${S} stroke-width="2.6"/>` },
  burden:   { color: "purple", label: "なにを しょうめい する", svg: `<path d="M9 8.2V7a3 3 0 0 1 6 0v1.2" ${S} stroke-width="2.4"/><circle cx="12" cy="14.4" r="6.4" fill="currentColor"/>` },
  swan:     { color: "cyan",   label: "ほんとうに ぜんぶ", svg: `<path d="M9.2 9.6c0-3.2 1.4-5.2 3.4-5.2 1.6 0 2.4 1.2 2.4 2.2l2 .6-2.2.6c-.6 1.8-2.4 2.8-2.4 5.2 0 1 .8 1.6 2 1.6h4.4c-.4 3.2-3.4 5-7 5-3.8 0-6.6-2-6.6-4.6 0-2 1.6-3.4 4-3.4z" fill="currentColor"/>` },
  fallacy:  { color: "green",  label: "ろんりの わな", svg: `<ellipse cx="12" cy="13.6" rx="5.2" ry="6.4" fill="currentColor"/><circle cx="12" cy="6.4" r="2.6" fill="currentColor"/><path d="M6.8 11 3.8 9.6M6.8 15H3.4M7.4 18.4l-2.6 1.8M17.2 11l3-1.4M17.2 15h3.4M16.6 18.4l2.6 1.8M10.6 4.4 9.2 2.6M13.4 4.4l1.4-1.8" ${S} stroke-width="1.8"/>` },
  hammer:   { color: "grey",   label: "じぶんの 意見を テスト", svg: `<rect x="9.2" y="3.6" width="11" height="6.4" rx="2.2" transform="rotate(45 14.7 6.8)" fill="currentColor"/><path d="M11.6 11.4 4.6 18.4" ${S} stroke-width="3.2"/>` },
  rebut:    { color: "red",    label: "はんろん", svg: `<path d="M18.6 4v9" ${S} stroke-width="2.6"/><path d="M3.6 8.2h11.2a2.6 2.6 0 0 1 2.6 2.6 2.6 2.6 0 0 1-2.6 2.6H5" ${S} stroke-width="2.6"/><path d="M8.2 10.2 5 13.4l3.2 3.2" ${S} stroke-width="2.6"/>` },
  steelman: { color: "purple", label: "あいてを つよく する", svg: `<path d="M5 20c-.6-4.4.4-8.4 2.6-11.4l1.8-3.4 3 .8-1.4 3c1.6-.8 3.6-.6 4.6.6 1.8-.4 3.6.8 3.6 3 0 4-3.4 7.4-8.6 7.4z" fill="currentColor"/>` },
  impact:   { color: "cyan",   label: "だから なに", svg: `<path d="M12 3.4c1.8 2.6 3 4.2 3 5.8a3 3 0 0 1-6 0c0-1.6 1.2-3.2 3-5.8z" fill="currentColor"/><ellipse cx="12" cy="17" rx="8.4" ry="3.2" ${S} stroke-width="2"/><ellipse cx="12" cy="17" rx="3.8" ry="1.3" fill="currentColor"/>` },
  megaphone: { color: "pink",  label: "つたわる ことば", svg: `<path d="M4 9.6h3.4l8.6-4.8v14.4l-8.6-4.8H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.4 14.4 9 19.4" ${S} stroke-width="2.6"/><path d="M19 9.6v4.8" ${S} stroke-width="2.4"/>` },
  swap:     { color: "orange", label: "ぎゃくの がわ", svg: `<path d="M5.4 10a7 7 0 0 1 12.2-3.2" ${S} stroke-width="2.6"/><path d="M18.4 3.6v3.8h-3.8" ${S} stroke-width="2.6"/><path d="M18.6 14a7 7 0 0 1-12.2 3.2" ${S} stroke-width="2.6"/><path d="M5.6 20.4v-3.8h3.8" ${S} stroke-width="2.6"/>` },
};

/** @typedef {keyof typeof ICONS} IconName */
/** @typedef {"grey"|"cyan"|"blue"|"green"|"pink"|"orange"|"yellow"|"purple"|"red"|"white"|"brand"} GlossyColor */

// ── 絵（PNG）の 置き場所 ──────────────────────────────
// 絵は ChatGPT で 作った PNG（art_src/ → png/ → build_dist.py で dist/icons/（webp）。SERIES_GUIDE 5.2c ✅）。
// アプリへは sync_brand.py が dist/icons/ を <アプリ>/public/alan/icons/（おかねは www/alan/icons/）に コピーする。
//   <name>.webp       ボタン（意味の 色の 地＋白い 絵）
//   plain/<name>.webp 縁（地）なし・色つき
//   glyph/<name>.webp 白い 絵だけ（色の ある ボタンの 中）
//   glyph-dark/<name>.webp墨色の 絵だけ（明るい 地で 文字が 黒い ボタンの 中。icon(name, "ic", "dark")）
//   base/<color>.png  絵なしの 地（色を かえる とき、glyph を かさねる）
// 下の svg は 絵が 読みこめない ときの 予備（と 見本帳の くらべ用）。
let BASE = "/alan/icons/";
/** 絵の 置き場所を かえる（見本帳・テスト用）。さいごに / を つける。 */
export function setIconBase(url) { BASE = url; }

function img(src, cls, name) {
  const el = document.createElement("img");
  el.src = BASE + src;
  el.className = cls;
  el.alt = "";
  el.setAttribute("aria-hidden", "true");
  el.draggable = false;
  el.decoding = "async";
  el.dataset.icon = name;
  return el;
}

function check(name) {
  if (!ICONS[name]) throw new Error(`alan-icons: "${name}" は ない。ICONS に 足すこと（1つの 意味に 1つ）`);
}

/**
 * 絵だけ（.ic）。色の ある ボタンの 中・タブ など。
 * 地が 明るくて 文字が 黒い ボタン（空手の 金 など）では tone = "dark"（墨色の 絵）
 * @param {IconName} name
 * @param {string} [cls]
 * @param {"light"|"dark"} [tone]
 */
export function icon(name, cls = "ic", tone = "light") {
  check(name);
  return img(`${tone === "dark" ? "glyph-dark" : "glyph"}/${name}.webp`, cls, name);
}

/**
 * 縁（地）なしの 色つきの 絵（.ic-plain）。ほのお・チェック・ほし を 単体で おくとき。
 * @param {IconName} name
 * @param {"s"|"m"|"l"|"xl"} [size]
 */
export function plainIcon(name, size = "m") {
  check(name);
  return img(`plain/${name}.webp`, `ic-plain gicon-${size}`, name);
}

/**
 * グロッシーの 丸い ボタンの アイコン（.gicon）。
 * @param {IconName} name
 * @param {"s"|"m"|"l"|"xl"} [size]
 * @param {GlossyColor} [color] ふつうは 書かない（意味の 色を つかう）。書くと 地を その色に して 白い 絵を かさねる
 */
export function glossyIcon(name, size = "m", color) {
  check(name);
  const span = document.createElement("span");
  span.className = `gicon gicon-img gicon-${size}`;
  if (!color || color === ICONS[name].color) {
    span.append(img(`${name}.webp`, "gicon-pic", name));
  } else if (color === "brand") {
    // アプリの 色（--brand）は PNG の 地が ない → CSS の グロッシー（.g-brand）に 白い 絵
    span.className = `gicon g-brand gicon-${size}`;
    span.append(img(`glyph/${name}.webp`, "gicon-glyph", name));
  } else {
    span.append(img(`base/${color}.webp`, "gicon-pic", name), img(`glyph/${name}.webp`, "gicon-glyph", name));
  }
  return span;
}

/**
 * HTML 文字列が ほしいとき（おかねの テンプレート・innerHTML 用）。
 * @param {IconName} name
 * @param {"s"|"m"|"l"|"xl"} [size]
 * @param {GlossyColor} [color]
 */
export function glossyIconHTML(name, size = "m", color) {
  return glossyIcon(name, size, color).outerHTML;
}

/**
 * 絵の HTML 文字列（色の ある ボタンの 中で つかう）。
 * @param {IconName} name
 * @param {"light"|"dark"} [tone]
 */
export function iconHTML(name, tone = "light") {
  return icon(name, "ic", tone).outerHTML;
}

/**
 * 縁なしの 色つきの 絵の HTML 文字列。
 * @param {IconName} name
 * @param {"s"|"m"|"l"|"xl"} [size]
 */
export function plainIconHTML(name, size = "m") {
  return plainIcon(name, size).outerHTML;
}

/**
 * アイコンだけの ボタン（もどる・とじる など）。読み上げ（VoiceOver）には label を 読ませる。
 * @param {IconName} name
 * @param {() => void} onTap
 * @param {"s"|"m"|"l"|"xl"} [size]
 * @param {GlossyColor} [color]
 */
export function iconButton(name, onTap, size = "m", color) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "a-iconbtn";
  b.setAttribute("aria-label", ICONS[name].label);
  b.append(glossyIcon(name, size, color));
  b.addEventListener("click", onTap);
  return b;
}

/** 予備：SVG の 絵（PNG が ない 環境・くらべ用） */
export function iconSvg(name, cls = "ic") {
  check(name);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name].svg;
  return svg;
}
