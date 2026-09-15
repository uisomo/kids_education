import type { CueRole } from "./cue-player";

export interface StoredClip { id: string; role: CueRole; label: string; blob: Blob }

export const CUE_ROLES: readonly CueRole[] = ["announce", "countdown", "encouragement"];

export function isCueRole(v: unknown): v is CueRole {
  return typeof v === "string" && (CUE_ROLES as readonly string[]).includes(v);
}

export interface KvAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  entries(): Promise<[string, unknown][]>;
}

export interface VoiceImportResult { imported: number; skipped: number }

// Thrown by VoiceStore.import when the file isn't a voice backup at all.
export class VoiceImportError extends Error {
  constructor(message = "invalid voice backup") {
    super(message);
    this.name = "VoiceImportError";
  }
}

// IndexedDB-backed KvAdapter for production.
export function idbKv(dbName = "karate-voice"): KvAdapter {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = async (mode: IDBTransactionMode) =>
    (await open()).transaction("clips", mode).objectStore("clips");
  return {
    async get(k) { const s = await tx("readonly"); return new Promise((res, rej) => { const q = s.get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const s = await tx("readwrite"); return new Promise<void>((res, rej) => { const q = s.put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
    async delete(k) { const s = await tx("readwrite"); return new Promise<void>((res, rej) => { const q = s.delete(k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); },
    async entries() { const s = await tx("readonly"); return new Promise((res, rej) => {
      const out: [string, unknown][] = [];
      const c = s.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push([String(cur.key), cur.value]); cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    }); },
  };
}

// Unique across launches (a per-launch counter could collide with stored ids
// and overwrite clips when crypto.randomUUID is unavailable).
const randomPart = () =>
  globalThis.crypto?.randomUUID?.()
  ?? `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
const nextId = () => `clip-${Date.now().toString(36)}-${randomPart()}`;

function isBlob(v: unknown): v is Blob {
  return !!v && typeof v === "object" && typeof (v as Blob).size === "number"
    && typeof (v as Blob).type === "string";
}

async function blobBytes(b: Blob): Promise<Uint8Array> {
  if (typeof b.arrayBuffer === "function") return new Uint8Array(await b.arrayBuffer());
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(new Uint8Array(fr.result as ArrayBuffer));
    fr.onerror = () => rej(fr.error);
    fr.readAsArrayBuffer(b);
  });
}

async function blobText(b: Blob): Promise<string> {
  if (typeof b.text === "function") return b.text();
  return new TextDecoder().decode(await blobBytes(b));
}

// Strict base64 → bytes; null when the string isn't decodable.
function decodeBase64(data: unknown): Uint8Array | null {
  if (typeof data !== "string") return null;
  const s = data.replace(/\s+/g, "");
  if (!s || s.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  try {
    return Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class VoiceStore {
  private clips = new Map<string, StoredClip>();
  private urls = new Map<string, string>();

  constructor(private kv: KvAdapter) {}

  async init(): Promise<void> {
    for (const [key, value] of await this.kv.entries()) {
      const clip = value as StoredClip;
      if (!clip || !isBlob(clip.blob)) continue;   // unreadable record: ignore
      this.clips.set(key, clip);
      try {
        this.urls.set(key, URL.createObjectURL(clip.blob));
      } catch {
        /* no playable url — list() filters it out */
      }
    }
  }

  async add(role: CueRole, label: string, blob: Blob): Promise<StoredClip> {
    return this.put(nextId(), role, label, blob);
  }

  private async put(id: string, role: CueRole, label: string, blob: Blob): Promise<StoredClip> {
    const clip: StoredClip = { id, role, label, blob };
    await this.kv.set(clip.id, clip);
    this.clips.set(clip.id, clip);
    this.urls.set(clip.id, URL.createObjectURL(blob));
    return clip;
  }

  async remove(id: string): Promise<void> {
    await this.kv.delete(id);
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.clips.delete(id);
  }

  async all(): Promise<StoredClip[]> {
    return [...this.clips.values()];
  }

  list(role: CueRole): { id: string; url: string }[] {
    return [...this.clips.values()]
      .filter((c) => c.role === role)
      .map((c) => ({ id: c.id, url: this.urls.get(c.id) }))
      .filter((x): x is { id: string; url: string } => typeof x.url === "string");
  }

  async export(): Promise<Blob> {
    const toB64 = (b: Blob) => new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res((fr.result as string).split(",")[1] ?? "");
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(b);
    });
    const items = await Promise.all([...this.clips.values()].map(async (c) => ({
      id: c.id, role: c.role, label: c.label, type: c.blob.type, data: await toB64(c.blob),
    })));
    return new Blob([JSON.stringify({ version: 1, items })], { type: "application/json" });
  }

  // Import a backup made by export(). Every item is validated (known role,
  // decodable non-empty data); invalid items and duplicates (same id, or same
  // role + identical bytes as an existing / already-imported clip) are skipped.
  // Throws VoiceImportError only when the file isn't a backup at all.
  async import(file: Blob): Promise<VoiceImportResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await blobText(file));
    } catch {
      throw new VoiceImportError();
    }
    const items = parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) throw new VoiceImportError();

    // Byte cache of existing clips, filled lazily only on role + size match.
    const known = new Map<string, Uint8Array>();
    const bytesOf = async (c: StoredClip) => {
      let b = known.get(c.id);
      if (!b) { b = await blobBytes(c.blob); known.set(c.id, b); }
      return b;
    };
    const isDuplicate = async (id: unknown, role: CueRole, bytes: Uint8Array) => {
      if (typeof id === "string" && this.clips.has(id)) return true;
      for (const c of this.clips.values()) {
        if (c.role !== role || c.blob.size !== bytes.length) continue;
        try {
          if (sameBytes(await bytesOf(c), bytes)) return true;
        } catch {
          /* unreadable existing blob — can't be a match */
        }
      }
      return false;
    };

    let imported = 0;
    let skipped = 0;
    for (const raw of items) {
      const it = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const bytes = decodeBase64(it.data);
      if (!isCueRole(it.role) || !bytes || bytes.length === 0) { skipped++; continue; }
      if (await isDuplicate(it.id, it.role, bytes)) { skipped++; continue; }
      const label = typeof it.label === "string" ? it.label : "";
      const type = typeof it.type === "string" ? it.type : "";
      const id = typeof it.id === "string" && it.id ? it.id : nextId();
      try {
        const clip = await this.put(id, it.role, label, new Blob([bytes as BlobPart], { type }));
        known.set(clip.id, bytes);
        imported++;
      } catch {
        skipped++;
      }
    }
    return { imported, skipped };
  }
}
