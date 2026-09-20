// The 「かざり」 burned into the saved video: Alan's frame around the picture,
// his badge in the corner, or the banner along the bottom. Household-wide (one
// video style for the family), so it lives in the base storage next to the plan.
//
// 「なし」 is the paid option: on Free every saved video carries one of the three
// decorations. A downgrade keeps the stored choice — like the locked members
// and menus, it simply stops applying until the plan comes back.

import type { Plan } from "./plan-store";

export type Decor = "frame" | "icon" | "banner" | "none";

export const DECORS: Decor[] = ["frame", "icon", "banner", "none"];

export interface DecorMeta {
  label: string;
  hint: string;
}

export const DECOR_META: Record<Decor, DecorMeta> = {
  frame: { label: "わく", hint: "どうがのまわりをかこむ" },
  icon: { label: "アラン", hint: "ひだり下に小さく出る" },
  banner: { label: "バナー", hint: "いちばん下に帯で出る" },
  none: { label: "なし", hint: "かざりをつけない" },
};

const KEY = "karate.videoDecor";
const DEFAULT_DECOR: Decor = "frame";

function isDecor(v: unknown): v is Decor {
  return v === "frame" || v === "icon" || v === "banner" || v === "none";
}

/// The choice the parent made, whatever the plan allows right now.
export function loadDecor(storage: Storage = localStorage): Decor {
  try {
    const raw = storage.getItem(KEY);
    return isDecor(raw) ? raw : DEFAULT_DECOR;
  } catch {
    return DEFAULT_DECOR;
  }
}

export function setDecor(decor: Decor, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, decor);
  } catch {
    /* ignore storage errors */
  }
}

/// Only a paid household can turn the decoration off.
export function canRemoveDecor(plan: Plan): boolean {
  return plan !== "free";
}

/// What the recording actually gets: 「なし」 falls back to the default while the
/// household is on Free, without overwriting what the parent picked.
export function effectiveDecor(plan: Plan, storage: Storage = localStorage): Decor {
  const decor = loadDecor(storage);
  return decor === "none" && !canRemoveDecor(plan) ? DEFAULT_DECOR : decor;
}
