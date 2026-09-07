// BGM mute preference — a device-level toggle (not per-member) for whether
// practice background music plays during a session.

const KEY = "karate.bgmMuted";

export function getBgmMuted(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setBgmMuted(muted: boolean, storage: Storage = localStorage): void {
  try {
    if (muted) storage.setItem(KEY, "1");
    else storage.removeItem(KEY);
  } catch {
    /* ignore storage errors */
  }
}
