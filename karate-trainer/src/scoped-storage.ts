// Member-scoped Storage wrapper: prefixes every key with `m:<memberId>:` so the
// existing stores (menu / kufu / progress / character) become per-member with
// zero changes to their logic — they just receive this instead of localStorage.
//
// Every Storage method is namespaced: key()/length only see this member's keys
// (returned without the prefix) and clear() removes only this member's keys —
// never the rest of the household.

export function scopeKey(memberId: string, key: string): string {
  return `m:${memberId}:${key}`;
}

// All base-storage keys (full, prefixed) that belong to `memberId`. Tolerates
// test doubles whose key() returns null / length is 0, or that lack key().
export function scopedKeysOf(base: Storage, memberId: string): string[] {
  const prefix = scopeKey(memberId, "");
  const out: string[] = [];
  try {
    const n = Number(base.length) || 0;
    if (typeof base.key !== "function") return out;
    for (let i = 0; i < n; i++) {
      const k = base.key(i);
      if (typeof k === "string" && k.startsWith(prefix)) out.push(k);
    }
  } catch {
    /* storage unavailable — nothing enumerable */
  }
  return out;
}

export function scopedStorage(base: Storage, memberId: string): Storage {
  const prefix = scopeKey(memberId, "");
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
      // Collect first: removing while iterating shifts base indices.
      for (const k of scopedKeysOf(base, memberId)) base.removeItem(k);
    },
    key(index: number): string | null {
      const k = scopedKeysOf(base, memberId)[index];
      return k === undefined ? null : k.slice(prefix.length);
    },
    get length(): number {
      return scopedKeysOf(base, memberId).length;
    },
  } as Storage;
}
