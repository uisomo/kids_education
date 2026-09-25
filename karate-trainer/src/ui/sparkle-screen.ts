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

// タブに出すアイコン。**そのキラキラが動画でやることを、そのまま小さく描く。**
// 稲妻ならギザギザが巻きつき、渦ならぐるぐる、オーラならまるく光る。
// 関係のない絵（ハートやお花）を出すと、開けてみるまで何がもらえるのか
// 分からない。色と style がそのまま「どれか」の目じるしになる。
//
// 太さと濃さを変えて3回重ねるのも動画と同じ理由（1本の線だと ただの落書き）。
function sparkleArt(s: SparkleDef, owned: boolean): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-0.62 -0.62 1.24 1.24");
  svg.setAttribute("class", "sparkle-art");
  svg.setAttribute("aria-hidden", "true");

  if (s.style === "aura") {
    if (!owned) {
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("r", "0.40");
      circle.setAttribute("fill", "rgba(255,255,255,0.05)");
      circle.setAttribute("stroke", "rgba(255,255,255,0.18)");
      circle.setAttribute("stroke-width", "0.16");
      svg.append(circle);
      return svg;
    }
    const id = `aura-${s.id}`;
    const defs = document.createElementNS(NS, "defs");
    const grad = document.createElementNS(NS, "radialGradient");
    grad.setAttribute("id", id);
    for (const [offset, color, opacity] of [
      ["0", "#ffffff", "1"], ["0.42", s.color, "1"], ["1", s.color, "0"],
    ] as [string, string, string][]) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      stop.setAttribute("stop-opacity", opacity);
      grad.append(stop);
    }
    defs.append(grad);
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", "0.52");
    circle.setAttribute("fill", `url(#${id})`);
    svg.append(defs, circle);
    return svg;
  }

  // 縦の骨に巻きついた線（Swift の SceneBuilder.wrap と同じ考えかた）。
  // 両端は骨に戻す（sin(πu)）ので、宙に浮いた線に見えない。
  // 稲妻は **角ばって** いないと、渦と見分けがつかない（小さいアイコンでは
  // 少しのギザギザは消えてしまう）。点を減らして、大きく折る。
  const lightning = s.style === "lightning";
  const d = lightning
    ? wrapPath({ samples: 8, turns: 1.15, amplitude: 0.26, jitter: 0.46, seed: hashId(s.id) })
    : wrapPath({ samples: 34, turns: 2.7, amplitude: 0.34, jitter: 0, seed: 0 });
  const passes: [number, number, string][] = owned
    ? [[0.34, 0.22, s.color], [0.17, 0.55, s.color], [0.06, 0.95, "#ffffff"]]
    : [[0.17, 1, "rgba(255,255,255,0.18)"]];
  for (const [width, opacity, color] of passes) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-opacity", String(opacity));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}

/// 上から下へ進みながら左右に振れる線。SVG のパスにして返す。
function wrapPath(o: { samples: number; turns: number; amplitude: number; jitter: number; seed: number }): string {
  const parts: string[] = [];
  const samples = o.samples;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const y = -0.5 + u;
    const envelope = Math.sin(Math.PI * u);
    let x = o.amplitude * Math.sin(u * o.turns * 2 * Math.PI) * envelope;
    if (o.jitter > 0) x += o.jitter * (noise(o.seed, i) - 0.5) * envelope;
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(4)} ${y.toFixed(4)}`);
  }
  return parts.join(" ");
}

/// 決まった答えを返す雑音。描き直すたびに稲妻の形が変わらないように。
function noise(a: number, b: number): number {
  let h = Math.imul(a ^ 0x5bf03635, 73856093) ^ Math.imul(b, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h, 31) + id.charCodeAt(i);
  return h >>> 0;
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
