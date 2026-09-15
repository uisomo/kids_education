// Native backup of the app's localStorage.
//
// Everything (members, menus, belts, 強さ, 工夫, comments) lives in the web
// view's localStorage, which iOS may clear under storage pressure and which
// is easy to orphan if the web view's origin ever changes. On the iOS app we
// mirror every karate key into a JSON file in the app's Library folder (kept
// in iPhone/iCloud backups, invisible to the user) and restore from it when
// localStorage comes up empty. Deleting the app still deletes both.

export interface BackupFile {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
}

const OWN_KEY = /^(karate\.|m:)/;

// Every key this app owns, as a plain object.
export function snapshotStorage(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k === null || !OWN_KEY.test(k)) continue;
    const v = storage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

// Restores a backup only when storage holds none of the app's keys (a fresh or
// wiped web view), so a stale file never overwrites newer data. Returns true
// when something was restored.
export function restoreIfEmpty(storage: Storage, json: string): boolean {
  if (Object.keys(snapshotStorage(storage)).length > 0) return false;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return false;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  let restored = false;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!OWN_KEY.test(k) || typeof v !== "string") continue;
    try {
      storage.setItem(k, v);
      restored = true;
    } catch {
      /* storage full — keep what fit */
    }
  }
  return restored;
}

// Wraps storage so every write schedules a backup. Reads pass straight through.
export function mirroredStorage(base: Storage, onWrite: () => void): Storage {
  return {
    getItem: (k: string) => base.getItem(k),
    setItem: (k: string, v: string) => { base.setItem(k, v); onWrite(); },
    removeItem: (k: string) => { base.removeItem(k); onWrite(); },
    clear: () => { base.clear(); onWrite(); },
    key: (i: number) => base.key(i),
    get length() { return base.length; },
  } as Storage;
}

// Coalesces bursts of writes (typing a drill name writes on every key) into
// one file write after `delayMs`. flush() writes immediately (app going to the
// background).
export function makeBackupScheduler(storage: Storage, file: BackupFile, delayMs = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async (): Promise<void> => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    try {
      await file.write(JSON.stringify(snapshotStorage(storage)));
    } catch {
      /* backup is best-effort; localStorage still has the data */
    }
  };
  return {
    schedule(): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delayMs);
    },
    flush,
  };
}

// The real file, via @capacitor/filesystem (native only).
export function nativeBackupFile(): BackupFile {
  const path = "karate-backup.json";
  return {
    async read() {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      try {
        const r = await Filesystem.readFile({ path, directory: Directory.Library, encoding: Encoding.UTF8 });
        return typeof r.data === "string" ? r.data : null;
      } catch {
        return null;   // no backup yet
      }
    },
    async write(data: string) {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      await Filesystem.writeFile({ path, data, directory: Directory.Library, encoding: Encoding.UTF8 });
    },
  };
}
