// Whether a kid may send their practice video out (LINE / SNS) from the done
// screen. Set per member by a parent on the 家族 tab (behind the parental
// gate), so the send button itself needs no gate. Off until a parent turns it
// on. Stored through scopedStorage(base, memberId), so removing the member
// removes it too.

const KEY = "karate.shareAllowed";

export function getShareAllowed(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setShareAllowed(allowed: boolean, storage: Storage = localStorage): void {
  try {
    if (allowed) storage.setItem(KEY, "1");
    else storage.removeItem(KEY);
  } catch {
    /* ignore storage errors */
  }
}
