// おたより (letter) store — the parent's messages to one kid, kept as a small
// queue instead of the single overwritten 感想コメント of E4.
//
// Why a queue: the old banner showed the same one message at the top of 特訓
// every day until a parent retyped it, so it stopped meaning anything. A queue
// gives each message its own life: it arrives unread (the ✉️ chip shows NEW),
// it is read once, and it stays readable behind 「‹ まえのおたより」 until older
// ones fall off the end.
//
// Per member via mem() at the call site, like comment-store was. Free on every
// plan, localStorage only — nothing leaves the phone.

import { loadComments } from "./comment-store";

const KEY = "karate.letters";
// The card is a full 便箋, not the old one-line bar, so the text can be longer.
export const LETTER_MAX_LEN = 60;
export const LETTER_BY_MAX_LEN = 10;
// How many letters are kept. Older ones drop off: this is a keepsake shelf,
// not an archive, and localStorage is shared with videos and 工夫.
export const LETTER_KEEP = 5;

export interface Letter {
  id: string;
  text: string;
  by: string;
  createdAt: number;   // epoch ms
  readAt?: number;     // absent = unread (drives the NEW badge)
}

function isLetter(v: unknown): v is Letter {
  if (!v || typeof v !== "object") return false;
  const l = v as Partial<Letter>;
  return typeof l.id === "string" && typeof l.text === "string"
    && typeof l.by === "string" && typeof l.createdAt === "number";
}

let seq = 0;
const newId = (): string => `l${Date.now()}-${seq++}`;

function write(letters: Letter[], storage: Storage): Letter[] {
  try {
    storage.setItem(KEY, JSON.stringify(letters));
  } catch {
    /* ignore storage errors — the UI still shows what it was handed */
  }
  return letters;
}

// Newest first, capped at LETTER_KEEP.
function normalize(letters: Letter[]): Letter[] {
  return [...letters].sort((a, b) => b.createdAt - a.createdAt).slice(0, LETTER_KEEP);
}

// A member who already had a 感想コメント keeps it: it becomes their first
// letter (unread, so the new ✉️ actually shows it once) rather than silently
// disappearing when the sticky banner goes away. Runs once — the migrated
// queue is written back, so reading it sticks.
function migrateFromComments(storage: Storage): Letter[] {
  const { kansou, kansouBy } = loadComments(storage);
  const text = kansou.trim();
  if (!text) return write([], storage);
  return write([{
    id: newId(),
    text,
    by: kansouBy.trim(),
    createdAt: Date.now(),
  }], storage);
}

export function loadLetters(storage: Storage = localStorage): Letter[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return [];
  }
  if (raw === null) return migrateFromComments(storage);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed.filter(isLetter));
  } catch {
    return [];
  }
}

// Adds one letter at the front (unread). Empty / whitespace-only is ignored so
// a stray tap on 「おくる」 never posts a blank 便箋.
export function addLetter(
  text: string,
  by: string,
  storage: Storage = localStorage,
): Letter[] {
  const clean = text.trim().slice(0, LETTER_MAX_LEN);
  if (!clean) return loadLetters(storage);
  const letter: Letter = {
    id: newId(),
    text: clean,
    by: by.trim().slice(0, LETTER_BY_MAX_LEN),
    createdAt: Date.now(),
  };
  return write(normalize([letter, ...loadLetters(storage)]), storage);
}

// Marks one letter read. Already-read letters keep their first readAt.
export function markLetterRead(id: string, storage: Storage = localStorage): Letter[] {
  const letters = loadLetters(storage);
  if (!letters.some((l) => l.id === id && l.readAt === undefined)) return letters;
  return write(
    letters.map((l) => (l.id === id && l.readAt === undefined ? { ...l, readAt: Date.now() } : l)),
    storage,
  );
}

export function removeLetter(id: string, storage: Storage = localStorage): Letter[] {
  return write(loadLetters(storage).filter((l) => l.id !== id), storage);
}

export function unreadLetters(letters: Letter[]): Letter[] {
  return letters.filter((l) => l.readAt === undefined);
}
