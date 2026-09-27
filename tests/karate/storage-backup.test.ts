// ネイティブバックアップ（karate-backup.json）の中身。実機で「記録が全部消えた」
// ように見えた原因調査（2026-09-27）で、この土台には一度もテストが無かったと
// 分かったので追加した。子どもが毎日使っている本番データを守る仕組みなので、
// ここが壊れると気づかないまま被害が広がる。
import { describe, it, expect, vi } from "vitest";
import { snapshotStorage, restoreIfEmpty, makeBackupScheduler, mirroredStorage, type BackupFile } from "../../karate-trainer/src/storage-backup";

function memStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe("snapshotStorage", () => {
  it("このアプリの持ちもの（karate. と m:）だけを拾う", () => {
    const s = memStorage({
      "karate.members": "a",
      "m:m1:karate.menu": "b",
      "unrelated.key": "c",
      "karateXsomethingElse": "d",   // 「karate.」で始まらないので対象外
    });
    expect(snapshotStorage(s)).toEqual({
      "karate.members": "a",
      "m:m1:karate.menu": "b",
    });
  });

  it("空なら空オブジェクト", () => {
    expect(snapshotStorage(memStorage())).toEqual({});
  });
});

describe("restoreIfEmpty", () => {
  it("空のときだけ、バックアップの中身をぜんぶ書き戻す", () => {
    const s = memStorage();
    const ok = restoreIfEmpty(s, JSON.stringify({
      "karate.members": "けんた", "m:m1:karate.streak": "12",
    }));
    expect(ok).toBe(true);
    expect(s.getItem("karate.members")).toBe("けんた");
    expect(s.getItem("m:m1:karate.streak")).toBe("12");
  });

  // **いちばん大事な性質**: 何か1つでも自分の持ちものが残っていたら、
  // 古いバックアップで今のデータを上書きしない。
  it("1つでも自分のキーが残っていたら、何もしない（新しいデータを消さない）", () => {
    const s = memStorage({ "karate.videoSaved": "1" });
    const ok = restoreIfEmpty(s, JSON.stringify({ "karate.members": "ふるいデータ" }));
    expect(ok).toBe(false);
    expect(s.getItem("karate.members")).toBeNull();
    expect(s.getItem("karate.videoSaved")).toBe("1");
  });

  it("こわれた JSON は無視する（例外を投げない）", () => {
    const s = memStorage();
    expect(restoreIfEmpty(s, "{ this is not json")).toBe(false);
    expect(Object.keys(snapshotStorage(s))).toHaveLength(0);
  });

  it("配列や null など、オブジェクトでないものは無視する", () => {
    const s = memStorage();
    expect(restoreIfEmpty(s, JSON.stringify(["a", "b"]))).toBe(false);
    expect(restoreIfEmpty(s, "null")).toBe(false);
  });

  it("このアプリのキーでないものや、値が文字列でないものは書き戻さない", () => {
    const s = memStorage();
    const ok = restoreIfEmpty(s, JSON.stringify({
      "karate.members": "ok",
      "other.app.key": "no",
      "karate.number": 123,
    }));
    expect(ok).toBe(true);
    expect(s.getItem("karate.members")).toBe("ok");
    expect(s.getItem("other.app.key")).toBeNull();
    expect(s.getItem("karate.number")).toBeNull();
  });

  it("保存できない値があっても、書けたぶんは残す（クォータ超えでも全滅させない）", () => {
    const s = memStorage();
    let calls = 0;
    const guarded: Storage = {
      ...s,
      setItem: (k, v) => {
        calls++;
        if (k === "karate.big") throw new Error("QuotaExceededError");
        s.setItem(k, v);
      },
    } as Storage;
    const ok = restoreIfEmpty(guarded, JSON.stringify({
      "karate.members": "ok", "karate.big": "x".repeat(10),
    }));
    expect(ok).toBe(true);
    expect(s.getItem("karate.members")).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("makeBackupScheduler", () => {
  it("短い間に何回書いても、1回だけファイルに書く（デバウンス）", async () => {
    vi.useFakeTimers();
    const s = memStorage({ "karate.members": "x" });
    const writes: string[] = [];
    const file: BackupFile = { read: vi.fn(), write: async (d) => { writes.push(d); } };
    const sched = makeBackupScheduler(s, file, 1000);
    sched.schedule();
    sched.schedule();
    sched.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({ "karate.members": "x" });
    vi.useRealTimers();
  });

  it("flush() はタイマーを待たずにすぐ書く", async () => {
    const s = memStorage({ "karate.members": "x" });
    const writes: string[] = [];
    const file: BackupFile = { read: vi.fn(), write: async (d) => { writes.push(d); } };
    const sched = makeBackupScheduler(s, file);
    await sched.flush();
    expect(writes).toHaveLength(1);
  });

  it("ファイルへの書き込みが失敗しても、例外を外に投げない（保存はあくまで保険）", async () => {
    const s = memStorage({ "karate.members": "x" });
    const file: BackupFile = { read: vi.fn(), write: async () => { throw new Error("disk full"); } };
    const sched = makeBackupScheduler(s, file);
    await expect(sched.flush()).resolves.toBeUndefined();
  });
});

describe("mirroredStorage", () => {
  it("書き込むたびに onWrite を呼び、中身は元の storage に届く", () => {
    const base = memStorage();
    let notified = 0;
    const mirrored = mirroredStorage(base, () => { notified++; });
    mirrored.setItem("karate.members", "x");
    expect(base.getItem("karate.members")).toBe("x");
    expect(notified).toBe(1);
    mirrored.removeItem("karate.members");
    expect(base.getItem("karate.members")).toBeNull();
    expect(notified).toBe(2);
  });

  it("読み取りは onWrite を呼ばない", () => {
    const base = memStorage({ "karate.members": "x" });
    let notified = 0;
    const mirrored = mirroredStorage(base, () => { notified++; });
    expect(mirrored.getItem("karate.members")).toBe("x");
    expect(notified).toBe(0);
  });
});
