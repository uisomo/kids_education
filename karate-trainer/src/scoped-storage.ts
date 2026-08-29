// Member-scoped Storage wrapper: prefixes every key with `m:<memberId>:` so the
// existing stores (menu / kufu / progress / character) become per-member with
// zero changes to their logic — they just receive this instead of localStorage.
//
// Only get/set/removeItem are namespaced (that's all the stores use). key()/
// length/clear operate on the underlying store unprefixed; the stores don't use
// them, so this stays intentionally minimal.

export function scopeKey(memberId: string, key: string): string {
  return `m:${memberId}:${key}`;
}

export function scopedStorage(base: Storage, memberId: string): Storage {
  return {
    getItem(key: string): string | null {
      return base.getItem(scopeKey(memberId, key));
    },
    setItem(key: string, value: string): void {
      base.setItem(scopeKey(memberId, key), value);
    },
    removeItem(key: string): void {
      base.removeItem(scopeKey(memberId, key));
    },
    clear(): void {
      base.clear();
    },
    key(index: number): string | null {
      return base.key(index);
    },
    get length(): number {
      return base.length;
    },
  } as Storage;
}
