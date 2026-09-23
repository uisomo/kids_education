// 🪝 read-aloud hook preference, per member: whether the practice opens with
// words the kid reads out loud (before Ready → Go!!), and those words as typed.
//
// With `auto` on the typed words are left alone and every practice draws its
// own from HOOK_PRESETS instead — see hook-presets.ts. What it drew last time
// is remembered (`lastPreset`, `lastPalette`) only so the next one differs.

const KEY = "karate.hook";

export interface HookSetting {
  on: boolean;
  text: string;
  // 「自動」: ignore `text` and use a different preset every practice.
  auto: boolean;
}

interface StoredHook extends HookSetting {
  lastPreset: number | null;
  lastPalette: number | null;
}

const EMPTY: StoredHook = { on: false, text: "", auto: false, lastPreset: null, lastPalette: null };

function load(storage: Storage): StoredHook {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<StoredHook>;
    return {
      on: v.on === true,
      text: typeof v.text === "string" ? v.text : "",
      auto: v.auto === true,
      lastPreset: typeof v.lastPreset === "number" ? v.lastPreset : null,
      lastPalette: typeof v.lastPalette === "number" ? v.lastPalette : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(value: StoredHook, storage: Storage): void {
  try {
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}

export function getHook(storage: Storage = localStorage): HookSetting {
  const { on, text, auto } = load(storage);
  return { on, text, auto };
}

export function setHook(value: HookSetting, storage: Storage = localStorage): void {
  const stored = load(storage);
  save({ ...stored, on: value.on === true, text: value.text ?? "", auto: value.auto === true }, storage);
}

// What the last practice drew, so the next one can avoid it.
export function getHookPick(storage: Storage = localStorage): { preset: number | null; palette: number | null } {
  const { lastPreset, lastPalette } = load(storage);
  return { preset: lastPreset, palette: lastPalette };
}

export function setHookPick(
  pick: { preset?: number | null; palette?: number | null }, storage: Storage = localStorage,
): void {
  const stored = load(storage);
  save({
    ...stored,
    lastPreset: pick.preset === undefined ? stored.lastPreset : pick.preset,
    lastPalette: pick.palette === undefined ? stored.lastPalette : pick.palette,
  }, storage);
}
