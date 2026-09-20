// 🪝 read-aloud hook preference, per member: whether the practice opens with
// words the kid reads out loud (before Ready → Go!!), and those words as typed.

const KEY = "karate.hook";

export interface HookSetting {
  on: boolean;
  text: string;
}

export function getHook(storage: Storage = localStorage): HookSetting {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { on: false, text: "" };
    const v = JSON.parse(raw) as Partial<HookSetting>;
    return { on: v.on === true, text: typeof v.text === "string" ? v.text : "" };
  } catch {
    return { on: false, text: "" };
  }
}

export function setHook(value: HookSetting, storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore storage errors */
  }
}
