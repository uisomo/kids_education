import type { CueRole } from "./cue-player";

export interface StoredClip { id: string; role: CueRole; label: string; blob: Blob }

export interface KvAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  entries(): Promise<[string, unknown][]>;
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

let counter = 0;
const nextId = () => `clip-${counter++}-${(globalThis.crypto?.randomUUID?.() ?? String(counter))}`;

export class VoiceStore {
  private clips = new Map<string, StoredClip>();
  private urls = new Map<string, string>();

  constructor(private kv: KvAdapter) {}

  async init(): Promise<void> {
    for (const [key, value] of await this.kv.entries()) {
      const clip = value as StoredClip;
      this.clips.set(key, clip);
      this.urls.set(key, URL.createObjectURL(clip.blob));
    }
  }

  async add(role: CueRole, label: string, blob: Blob): Promise<StoredClip> {
    const clip: StoredClip = { id: nextId(), role, label, blob };
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
    const toB64 = (b: Blob) => new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res((fr.result as string).split(",")[1] ?? "");
      fr.readAsDataURL(b);
    });
    const items = await Promise.all([...this.clips.values()].map(async (c) => ({
      role: c.role, label: c.label, type: c.blob.type, data: await toB64(c.blob),
    })));
    return new Blob([JSON.stringify({ version: 1, items })], { type: "application/json" });
  }

  async import(file: Blob): Promise<void> {
    const text = await file.text();
    const parsed = JSON.parse(text) as { items: { role: CueRole; label: string; type: string; data: string }[] };
    for (const it of parsed.items) {
      const bytes = Uint8Array.from(atob(it.data), (ch) => ch.charCodeAt(0));
      await this.add(it.role, it.label, new Blob([bytes], { type: it.type }));
    }
  }
}
