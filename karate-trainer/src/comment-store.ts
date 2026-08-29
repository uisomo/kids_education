// 応援コメント (comment) store — parent-written encouragement, per member (E4).
// Two free-form messages, one value each (editing overwrites):
//   kansou = 感想コメント, shown at the top of the 特訓 (setup) screen.
//   fight  = ファイト コメント, shown during practice and burned into the recording.
// Free on every plan (no plan gating). Per-member via mem() at the call site.

const KEY = "karate.comments";
export const COMMENT_MAX_LEN = 24;

export type CommentKind = "kansou" | "fight";
export interface Comments {
  kansou: string;
  fight: string;
}

const EMPTY: Comments = { kansou: "", fight: "" };

function isComments(v: unknown): v is Partial<Comments> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Both messages for a member, defaulting to "" each.
export function loadComments(storage: Storage = localStorage): Comments {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed: unknown = JSON.parse(raw);
    if (!isComments(parsed)) return { ...EMPTY };
    return {
      kansou: typeof parsed.kansou === "string" ? parsed.kansou : "",
      fight: typeof parsed.fight === "string" ? parsed.fight : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

// Overwrite one message (trimmed + capped). Empty / whitespace-only clears it.
export function saveComment(
  kind: CommentKind,
  text: string,
  storage: Storage = localStorage,
): Comments {
  const clean = text.trim().slice(0, COMMENT_MAX_LEN);
  const next = { ...loadComments(storage), [kind]: clean };
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore storage errors */
  }
  return next;
}
