// 自動で つくる（brand/sync_brand.py）。手で 直さない。名前は alan-icons.js の ICONS から。
export type IconName =
  | "back" | "close" | "next" | "home" | "play" | "record" | "camera" | "again"
  | "pause" | "random" | "share" | "save" | "add" | "check" | "star" | "flame"
  | "gift" | "new" | "film" | "chart" | "child" | "family" | "letter" | "idea"
  | "mic" | "headphones" | "trash" | "lock" | "settings" | "sound" | "mute" | "help"
  | "sparkle";

export type GlossyColor =
  | "grey" | "cyan" | "blue" | "green" | "pink" | "orange" | "yellow" | "purple" | "red" | "white" | "brand";

export type GlossySize = "s" | "m" | "l" | "xl";

export const ICONS: Record<IconName, { color: GlossyColor; label: string; svg: string }>;
export function setIconBase(url: string): void;
export function icon(name: IconName, cls?: string, tone?: "light" | "dark"): HTMLImageElement;
export function plainIcon(name: IconName, size?: GlossySize): HTMLImageElement;
export function plainIconHTML(name: IconName, size?: GlossySize): string;
export function iconSvg(name: IconName, cls?: string): SVGSVGElement;
export function glossyIcon(name: IconName, size?: GlossySize, color?: GlossyColor): HTMLSpanElement;
export function glossyIconHTML(name: IconName, size?: GlossySize, color?: GlossyColor): string;
export function iconHTML(name: IconName, tone?: "light" | "dark"): string;
export function iconButton(name: IconName, onTap: () => void, size?: GlossySize, color?: GlossyColor): HTMLButtonElement;
