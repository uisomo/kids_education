// 応援コメント (comment) store — parent-written encouragement, per member (E4).
// Two free-form messages, one value each (editing overwrites):
//   kansou   = 感想コメント, shown just above the 稽古 開始 button.
//   kansouBy = who wrote it ("by おかあさん" under the 感想).
//   fight  = ファイト コメント — no longer shown or editable; kept so old saved
//            data still loads.
// Free on every plan (no plan gating). Per-member via mem() at the call site.

const KEY = "karate.comments";
export const COMMENT_MAX_LEN = 24;
export const COMMENT_BY_MAX_LEN = 10;

export type CommentKind = "kansou" | "kansouBy" | "fight";
export interface Comments {
  kansou: string;
  kansouBy: string;
  fight: string;
}

const EMPTY: Comments = { kansou: "", kansouBy: "", fight: "" };

function isComments(v: unknown): v is Partial<Comments> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// All fields for a member, defaulting to "" each.
export function loadComments(storage: Storage = localStorage): Comments {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed: unknown = JSON.parse(raw);
    if (!isComments(parsed)) return { ...EMPTY };
    return {
      kansou: typeof parsed.kansou === "string" ? parsed.kansou : "",
      kansouBy: typeof parsed.kansouBy === "string" ? parsed.kansouBy : "",
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
  const clean = text.trim().slice(0, kind === "kansouBy" ? COMMENT_BY_MAX_LEN : COMMENT_MAX_LEN);
  const next = { ...loadComments(storage), [kind]: clean };
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore storage errors */
  }
  return next;
}
