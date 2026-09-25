// ✨キラキラ タブ — 集めたキラキラと、集めた帯。
//
// 「持っていないもの」も並べて出すのが大事。何が待っているか見えないと、
// 集める気持ちにならない。ただし 中身は見せない（形は影だけ、名前は ？）。
// どうやったら開くかだけ 書いておく。

import { MY_SPARKLES, loadUnlocked, nextToUnlock, SHORT_SECONDS, LONG_SECONDS } from "../sparkle-store";
import type { SparkleDef, SparkleTier } from "../sparkle-catalog";
import { BELTS } from "../belt-store";
import { createObi } from "./belt-card";
import { beltCollection } from "../belt-collection-store";
import { COPY, IS_PIANO } from "../flavor";

export interface SparkleScreenDeps {
  storage?: Storage;
  /// いま選ばれているキラキラの id（done 画面・家族タブと同じもの）。
  selectedId?: string | null;
  /// 持っているキラキラを押したとき。渡さなければ押しても何も起きない。
  onSelect?(id: string): void;
}

const TIER_RULE: Record<SparkleTier, string> = {
  start: "さいしょから つかえるよ",
  short: `${SHORT_SECONDS / 60}ふん いじょうの メニューを さいごまで やりきると 1こ`,
  long: `休憩なしの ${LONG_SECONDS / 60}ふん いじょうを さいごまで やりきると 1こ`,
};

const TIER_LABEL: Record<SparkleTier, string> = {
  start: "はじめから",
  short: `${SHORT_SECONDS / 60}ふん いじょう`,
  long: `休憩なし ${LONG_SECONDS / 60}ふん`,
};

// カタログの形を、そのまま画面の絵にする（ネイティブが動画に描くのと同じ形）。
// orb と halo には形が無いので、まるく光らせる。
function sparkleArt(s: SparkleDef, owned: boolean): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-0.62 -0.62 1.24 1.24");
  svg.setAttribute("class", "sparkle-art");
  svg.setAttribute("aria-hidden", "true");
  const ink = owned ? s.color : "rgba(255,255,255,0.18)";

  if (!s.shape && !owned) {
    // まだ持っていない たま／わっか。ぼやけた光のままだと、ほとんど何も
    // 見えない。輪郭のある まるにして「たま が入る場所」と分かるようにする。
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", "0.42");
    circle.setAttribute("fill", "rgba(255,255,255,0.05)");
    circle.setAttribute("stroke", ink);
    circle.setAttribute("stroke-width", s.style === "halo" ? "0.10" : "0.16");
    svg.append(circle);
    return svg;
  }

  if (!s.shape) {
    // 気のたま／わっか。まん中が白い まるい光。
    const id = `g-${s.id}`;
    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "radialGradient");
    grad.setAttribute("id", id);
    const stops: [string, string, string][] = [
      ["0", "#ffffff", "1"], ["0.42", s.color, "1"], ["1", s.color, "0"]];
    for (const [offset, color, opacity] of stops) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      stop.setAttribute("stop-opacity", opacity);
      grad.append(stop);
    }
    defs.append(grad);
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", s.style === "halo" ? "0.40" : "0.52");
    if (s.style === "halo") {
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", ink);
      circle.setAttribute("stroke-width", "0.11");
    } else {
      circle.setAttribute("fill", `url(#${id})`);
    }
    svg.append(defs, circle);
    return svg;
  }

  // 白いふちを先に敷くのは、動画のときと同じ理由（背景に溶けないように）。
  for (const pass of ["rim", "body"] as const) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", s.shape.d);
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (pass === "rim") {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", owned ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.10)");
      path.setAttribute("stroke-width", s.shape.fill ? "0.22" : "0.30");
    } else if (s.shape.fill) {
      path.setAttribute("fill", ink);
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", ink);
      path.setAttribute("stroke-width", "0.13");
    }
    svg.append(path);
  }
  return svg;
}

export function renderSparkleScreen(root: HTMLElement, deps: SparkleScreenDeps = {}): void {
  root.textContent = "";
  root.className = "screen sparkle";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "✨ キラキラ";
  root.append(title);

  const unlocked = new Set(loadUnlocked(deps.storage));

  const count = document.createElement("div");
  count.className = "sparkle-count";
  count.dataset.sparkleCount = String(unlocked.size);
  count.textContent = `${unlocked.size} / ${MY_SPARKLES.length} こ あつめた`;
  root.append(count);

  // つぎに何が開くか。開く順は決まっているので「つぎの1つ」だけ言う。
  const next = nextToUnlock(deps.storage);
  if (next.short || next.long) {
    const hint = document.createElement("div");
    hint.className = "sparkle-hint";
    hint.dataset.sparkleHint = "";
    const lines: string[] = [];
    if (next.long) lines.push(`🔒 ${TIER_RULE.long}`);
    if (next.short) lines.push(`🔒 ${TIER_RULE.short}`);
    hint.textContent = lines.join("\n");
    root.append(hint);
  }

  const grid = document.createElement("div");
  grid.className = "sparkle-grid";
  grid.dataset.sparkleGrid = "";

  MY_SPARKLES.forEach((s) => {
    const owned = unlocked.has(s.id);
    const cell = document.createElement(owned && deps.onSelect ? "button" : "div");
    cell.className = `sparkle-cell${owned ? " owned" : " locked"}`
      + (owned && s.id === deps.selectedId ? " selected" : "");
    cell.dataset.sparkle = s.id;
    if (cell instanceof HTMLButtonElement) {
      cell.type = "button";
      cell.addEventListener("click", () => deps.onSelect?.(s.id));
    }

    cell.append(sparkleArt(s, owned));

    const name = document.createElement("span");
    name.className = "sparkle-name";
    // 持っていないものは 中身を見せない。何が来るかは開いてからのお楽しみ。
    name.textContent = owned ? s.name : "？？？";
    cell.append(name);

    const tag = document.createElement("span");
    tag.className = "sparkle-tier";
    tag.textContent = owned ? "" : TIER_LABEL[s.tier];
    cell.append(tag);

    grid.append(cell);
  });
  root.append(grid);

  // ── 集めた帯 ───────────────────────────────────────────────────────────
  const beltTitle = document.createElement("h2");
  beltTitle.className = "sparkle-section";
  beltTitle.textContent = `${IS_PIANO ? "🎼" : "🥋"} あつめた${COPY.belt}`;
  root.append(beltTitle);

  const belts = beltCollection(deps.storage);
  const owned = belts.filter((b) => b.owned).length;

  const beltCount = document.createElement("div");
  beltCount.className = "sparkle-count";
  beltCount.dataset.beltCount = String(owned);
  beltCount.textContent = `${owned} / ${BELTS.length} ほん あつめた`;
  root.append(beltCount);

  const shelf = document.createElement("div");
  shelf.className = "belt-shelf";
  shelf.dataset.beltShelf = "";
  belts.forEach((b) => {
    const belt = BELTS[b.index];
    const cell = document.createElement("div");
    cell.className = `belt-shelf-cell${b.owned ? " owned" : " locked"}${belt.rpg ? " rpg" : ""}`;
    cell.dataset.belt = String(b.index);
    cell.append(createObi(b.index));
    const name = document.createElement("span");
    name.className = "belt-shelf-name";
    name.textContent = b.owned ? belt.name : "？？？";
    cell.append(name);
    shelf.append(cell);
  });
  root.append(shelf);
}
