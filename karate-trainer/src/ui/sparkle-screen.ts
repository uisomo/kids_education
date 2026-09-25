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
// 稲妻ならギザギザ、炎なら立ちのぼる舌、氷なら角ばった結晶、吹雪なら流れる粒。
// 関係のない絵（ハートやお花）を出すと、開けてみるまで何がもらえるのか分からない。
//
// 太さと濃さを変えて3回重ねるのも動画と同じ理由（1本の線だと ただの落書き）。
const NS = "http://www.w3.org/2000/svg";

function sparkleArt(s: SparkleDef, owned: boolean): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-0.62 -0.62 1.24 1.24");
  svg.setAttribute("class", "sparkle-art");
  svg.setAttribute("aria-hidden", "true");
  const seed = hashId(s.id);

  if (s.style === "aura") {
    svg.append(owned ? auraBall(s) : lockedRing());
    return svg;
  }

  // [パス, 太さ, 色（省略＝そのキラキラの色）] の並び。
  const strokes: { d: string; width: number; color?: string }[] = [];
  switch (s.style) {
    case "lightning":
      strokes.push({ d: wrapPath({ samples: 8, turns: 1.15, amplitude: 0.26, jitter: 0.46, seed }), width: 1 });
      break;
    case "flame":
      // 3本の舌。下ほど広がり、先はとがる（線の太さでしか表せないので短く）。
      for (const x of [-0.24, 0, 0.24]) {
        strokes.push({ d: tonguePath(x, x === 0 ? 1 : 0.72), width: x === 0 ? 1.15 : 0.8 });
      }
      break;
    case "ice":
      // まっすぐ・角ばった結晶。曲げない。
      for (const a of [-0.9, -0.1, 0.75]) strokes.push({ d: spikePath(a), width: 0.95 });
      break;
    case "blizzard":
      for (let i = 0; i < 7; i++) {
        strokes.push({ d: dashPath(seed + i * 17, i), width: 0.55 });
      }
      break;
    case "water":
      strokes.push({ d: wrapPath({ samples: 30, turns: 1.7, amplitude: 0.34, jitter: 0, seed: 0 }), width: 1.5 });
      break;
    case "wind":
      for (const y of [-0.32, 0, 0.32]) strokes.push({ d: crescentPath(y), width: 0.85 });
      break;
    case "sparkle":
      for (const [x, y, k] of [[0, -0.28, 1], [-0.28, 0.22, 0.65], [0.3, 0.16, 0.8]] as const) {
        strokes.push({ d: starPath(x, y, 0.26 * k), width: 0.7 * k });
      }
      break;
    case "petal":
      for (const [x, y, r] of [[-0.24, -0.2, 0.9], [0.22, -0.02, 1], [-0.06, 0.3, 0.75]] as const) {
        strokes.push({ d: petalPath(x, y, r), width: 0.9 });
      }
      break;
    case "shadow":
      strokes.push({ d: wrapPath({ samples: 16, turns: 1.2, amplitude: 0.26, jitter: 0.22, seed }), width: 2.2 });
      break;
    case "dragon":
      strokes.push({ d: serpentPath(), width: 1.7 });
      break;
    case "rainbow":
      for (const [i, color] of ["#ff4d52", "#59ff8c", "#73a0ff"].entries()) {
        strokes.push({ d: wrapPath({ samples: 28, turns: 2.2, amplitude: 0.2 + i * 0.08, jitter: 0, seed: 0 }), width: 0.85, color });
      }
      break;
    default: // ribbon
      strokes.push({ d: wrapPath({ samples: 34, turns: 2.7, amplitude: 0.34, jitter: 0, seed: 0 }), width: 1 });
  }

  for (const stroke of strokes) {
    const tint = stroke.color ?? s.color;
    // 持っていないものは 影だけ（何色かは開いてからのお楽しみ）。
    const passes: [number, number, string][] = owned
      ? [[0.34, 0.22, tint], [0.17, 0.55, tint], [0.06, 0.95, "#ffffff"]]
      : [[0.17, 1, "rgba(255,255,255,0.18)"]];
    for (const [w, opacity, color] of passes) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", stroke.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", String(w * stroke.width));
      path.setAttribute("stroke-opacity", String(opacity));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.append(path);
    }
  }
  return svg;
}

function auraBall(s: SparkleDef): SVGElement {
  const g = document.createElementNS(NS, "g");
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
  g.append(defs, circle);
  return g;
}

// まだ持っていない オーラ。ぼやけた光のままだと ほとんど何も見えない。
function lockedRing(): SVGElement {
  const circle = document.createElementNS(NS, "circle");
  circle.setAttribute("r", "0.40");
  circle.setAttribute("fill", "rgba(255,255,255,0.05)");
  circle.setAttribute("stroke", "rgba(255,255,255,0.18)");
  circle.setAttribute("stroke-width", "0.16");
  return circle;
}

const fmt = (x: number, y: number) => `${x.toFixed(3)} ${y.toFixed(3)}`;

/// 上から下へ進みながら左右に振れる線（Swift の wrap と同じ考えかた）。
function wrapPath(o: { samples: number; turns: number; amplitude: number; jitter: number; seed: number }): string {
  const parts: string[] = [];
  for (let i = 0; i <= o.samples; i++) {
    const u = i / o.samples;
    const envelope = Math.sin(Math.PI * u);
    let x = o.amplitude * Math.sin(u * o.turns * 2 * Math.PI) * envelope;
    if (o.jitter > 0) x += o.jitter * (noise(o.seed, i) - 0.5) * envelope;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(x, -0.5 + u)}`);
  }
  return parts.join(" ");
}

/// 炎の舌: 下から上へ、少しくねって立ちのぼる。
function tonguePath(x: number, height: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(x + 0.13 * Math.sin(u * 3.2) * u, 0.44 - 0.9 * height * u)}`);
  }
  return parts.join(" ");
}

/// 氷の結晶: まっすぐ生えて、途中で一度だけ折れる。
function spikePath(angle: number): string {
  const x = Math.sin(angle), y = -Math.cos(angle);
  return `M ${fmt(0, 0.34)} L ${fmt(x * 0.3, 0.34 + y * 0.34)} L ${fmt(x * 0.52, 0.34 + y * 0.82)}`;
}

/// 吹雪の粒: ななめの短い線。
function dashPath(seed: number, i: number): string {
  const x = (noise(seed, i) - 0.5) * 0.95;
  const y = (noise(seed, i + 91) - 0.5) * 0.95;
  return `M ${fmt(x - 0.09, y - 0.07)} L ${fmt(x + 0.09, y + 0.07)}`;
}

/// 風の三日月。
function crescentPath(y: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = (i / 8) * 2 - 1;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(u * 0.42, y + 0.16 * (1 - u * u))}`);
  }
  return parts.join(" ");
}

/// きらめきの星（十字）。
function starPath(x: number, y: number, r: number): string {
  return `M ${fmt(x - r, y)} L ${fmt(x + r, y)} M ${fmt(x, y - r)} L ${fmt(x, y + r)}`;
}

/// 花びら（閉じた しずく）。
function petalPath(x: number, y: number, r: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * 2 * Math.PI;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(x + 0.1 * r * Math.sin(a), y + 0.17 * r * Math.cos(a))}`);
  }
  return `${parts.join(" ")} Z`;
}

/// ドラゴンの胴: 巻きついて、下へ抜けて尾になる。
function serpentPath(): string {
  const parts: string[] = [];
  for (let i = 0; i <= 34; i++) {
    const u = (i / 34) * 1.4;
    const envelope = u <= 1 ? Math.sin(Math.PI * u) : Math.max(0, 1 - (u - 1) / 0.4) * 0.8;
    parts.push(`${i === 0 ? "M" : "L"} ${fmt(0.3 * Math.sin(u * 3 * 2 * Math.PI) * envelope, -0.5 + u * 0.78)}`);
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
