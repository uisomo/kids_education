# 空手稽古 iOS ネイティブ化 (Capacitor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の `karate-trainer/` Web アプリを、コードをほぼ書き直さずに App Store 提出可能な iOS ネイティブアプリ（Capacitor ラップ）にし、Mac に渡せば即ビルドできる状態まで WSL 上で仕上げる。

**Architecture:** 既存のバニラ TS + Vite アプリはそのまま。ネイティブ/Web の差分を新規 `platform.ts` 1ファイルに隔離し、`main.ts` から配線する。iOS で無効な2つのブラウザ機能（Wake Lock, `<a download>`）を Capacitor プラグイン（keep-awake, share）に差し替える。動画共有の前に保護者ゲートを挟む。コアロジック（scheduler / cue-player / setup・training・voice screen）は無変更。

**Tech Stack:** TypeScript, Vite 8, Vitest 4 (jsdom), Capacitor 8.x（`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`, `@capacitor-community/keep-awake`, `@capacitor/share`, `@capacitor/filesystem`）

**Spec:** `docs/superpowers/specs/2026-08-27-karate-trainer-ios-design.md`

## Global Constraints

- **絶対不変条件: 録画動画は端末外に一切送信しない。** アプリ自身がサーバ/第三者へ動画やその派生物を自動送信するコードを書かない。共有はユーザーが OS シェアシートで明示的に選ぶ場合のみ。
- Capacitor は **8.x** に統一（`@capacitor/core@^8`, `@capacitor/ios@^8`, `@capacitor/cli@^8`, `@capacitor-community/keep-awake@^8`, `@capacitor/share`, `@capacitor/filesystem`）。
- Bundle ID (appId): `com.ushimaru.karatetrainer` / App 名: `空手稽古`
- `capacitor.config.ts`: `webDir: 'dist'`, `server.iosScheme: 'https'`。
- MediaRecorder は **mp4 を優先**しハードコードしない（webm は iOS 18.4+ のみ）。既存 `recorder.ts` は既にこの方針なので変更しない。
- Info.plist 用途説明文（日本語）は spec §9 の文言をそのまま使う。
- メタデータ/コピーで **"For Kids" / "子ども向け" / "For Children" を使わない**（App Store Guideline 2.3.8）。
- テストは既存パターンに従う: ファイル冒頭に `// @vitest-environment jsdom`、DI は `vi.fn()` でモック、DOM 検証は `data-*` セレクタ、テストは `tests/karate/` に置く。
- 既存の空手テスト（現在 51 passing）を壊さない。各タスク末尾で `npx vitest run tests/karate/` が緑であることを確認。
- TDD・頻繁なコミット。コミットメッセージ末尾に spec の Co-Authored-By / Claude-Session トレーラーを付ける（既存リポジトリ慣習）。

---

## File Structure

- `karate-trainer/src/parental-gate.ts` — 新規。保護者ゲートの正誤判定ロジック（純関数）＋最小 UI レンダラ。責務: 「大人向けの簡単な確認」を出し、通過時にコールバックを呼ぶ。
- `karate-trainer/src/platform.ts` — 新規。ネイティブ/Web 分岐を知る唯一の場所。責務: `makeWakeGuard()` と `shareRecording()` を環境に応じて返す。
- `karate-trainer/src/ui/done-screen.ts` — 変更。保存ボタン押下 → 保護者ゲート → 共有、の導線に。
- `karate-trainer/src/app.ts` — 微調整。done-screen に「共有アクション」を渡せるようにする（DI 化）。
- `karate-trainer/src/main.ts` — 変更。`platform.ts` のファクトリを配線。
- `karate-trainer/capacitor.config.ts` — 新規。Capacitor 設定。
- `karate-trainer/privacy-policy.md` — 新規。プライバシーポリシー原稿（日英）。
- `karate-trainer/README.md` — 変更。iOS ビルド手順・審査ノート雛形・手動チェックリスト追記。
- `karate-trainer/ios/` — 新規（`npx cap add ios` で自動生成）。`Info.plist` に権限文追記。
- `package.json` — 変更。Capacitor 依存＋ `cap:sync` 等スクリプト。

タスク順序の考え方: 純ロジック（保護者ゲート）→ UI 配線（done-screen, app）→ プラットフォーム分岐（platform）→ main 配線 → Capacitor 設定・iOS 生成 → ドキュメント。前半（Task 1–4）は Mac 不要で完結しテスト可能。後半（Task 5–7）は設定・生成・文書。

---

### Task 1: 保護者ゲートのロジックと UI (`parental-gate.ts`)

保護者ゲート＝「大人向けの簡単な確認」。子どもが誤って共有しないための関門。まず正誤判定を純関数として作り、その上に最小 UI を載せる。判定は「2つの一桁〜二桁の数の足し算」を採用（未就学児には難しく、大人には自明）。問題は決定的にテストしたいので、数値ペアは外部から注入できる形にする。

**Files:**
- Create: `karate-trainer/src/parental-gate.ts`
- Test: `tests/karate/parental-gate.test.ts`

**Interfaces:**
- Consumes: なし（純新規）
- Produces:
  - `export interface GateChallenge { a: number; b: number; answer: number }`
  - `export function makeChallenge(rand?: () => number): GateChallenge` — `rand` は `[0,1)` を返す関数（既定 `Math.random`）。`answer === a + b`。
  - `export function checkAnswer(challenge: GateChallenge, input: string): boolean` — 入力文字列をトリムし数値化して `answer` と一致すれば true。
  - `export interface ParentalGateDeps { onPass(): void; onCancel(): void; challenge?: GateChallenge }`
  - `export function renderParentalGate(root: HTMLElement, deps: ParentalGateDeps): void` — `root` に問題文（`[data-gate-question]`）、数値入力（`[data-gate-input]`）、確定ボタン（`[data-gate-submit]`）、キャンセル（`[data-gate-cancel]`）を描画。正解で `onPass()`、キャンセルで `onCancel()`。不正解時はエラー表示（`[data-gate-error]`）を出し `onPass` は呼ばない。

- [ ] **Step 1: Write the failing test**

`tests/karate/parental-gate.test.ts`:

```ts
// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { makeChallenge, checkAnswer, renderParentalGate } from "../../karate-trainer/src/parental-gate";

it("makeChallenge produces a solvable addition with a matching answer", () => {
  // rand() sequence → deterministic a and b
  const seq = [0.5, 0.2];
  let i = 0;
  const c = makeChallenge(() => seq[i++]);
  expect(c.answer).toBe(c.a + c.b);
});

it("checkAnswer accepts the correct sum and rejects wrong/blank input", () => {
  const c = { a: 3, b: 4, answer: 7 };
  expect(checkAnswer(c, "7")).toBe(true);
  expect(checkAnswer(c, " 7 ")).toBe(true);
  expect(checkAnswer(c, "8")).toBe(false);
  expect(checkAnswer(c, "")).toBe(false);
});

it("renderParentalGate calls onPass only on a correct answer", () => {
  const root = document.createElement("div");
  const onPass = vi.fn();
  const onCancel = vi.fn();
  renderParentalGate(root, { onPass, onCancel, challenge: { a: 2, b: 5, answer: 7 } });

  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  const submit = root.querySelector<HTMLButtonElement>("[data-gate-submit]")!;

  input.value = "1";
  submit.click();
  expect(onPass).not.toHaveBeenCalled();
  expect(root.querySelector("[data-gate-error]")).not.toBeNull();

  input.value = "7";
  submit.click();
  expect(onPass).toHaveBeenCalledOnce();
});

it("renderParentalGate calls onCancel when cancel is pressed", () => {
  const root = document.createElement("div");
  const onCancel = vi.fn();
  renderParentalGate(root, { onPass: vi.fn(), onCancel, challenge: { a: 1, b: 1, answer: 2 } });
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/parental-gate.test.ts`
Expected: FAIL（`parental-gate` からの import が解決できない / 関数未定義）

- [ ] **Step 3: Write minimal implementation**

`karate-trainer/src/parental-gate.ts`:

```ts
export interface GateChallenge { a: number; b: number; answer: number }

// 大人向けの簡単な足し算。a,b は 2..9。rand は [0,1) を返す。
export function makeChallenge(rand: () => number = Math.random): GateChallenge {
  const a = 2 + Math.floor(rand() * 8);
  const b = 2 + Math.floor(rand() * 8);
  return { a, b, answer: a + b };
}

export function checkAnswer(challenge: GateChallenge, input: string): boolean {
  const n = Number(input.trim());
  if (input.trim() === "" || Number.isNaN(n)) return false;
  return n === challenge.answer;
}

export interface ParentalGateDeps {
  onPass(): void;
  onCancel(): void;
  challenge?: GateChallenge;
}

export function renderParentalGate(root: HTMLElement, deps: ParentalGateDeps): void {
  const challenge = deps.challenge ?? makeChallenge();
  root.textContent = "";
  root.className = "screen gate";

  const note = document.createElement("p");
  note.className = "gate-note";
  note.textContent = "おうちの人にわたしてね";

  const q = document.createElement("div");
  q.dataset.gateQuestion = "";
  q.className = "gate-question";
  q.textContent = `${challenge.a} + ${challenge.b} = ?`;

  const input = document.createElement("input");
  input.dataset.gateInput = "";
  input.setAttribute("inputmode", "numeric");
  input.type = "text";

  const err = document.createElement("div");
  err.dataset.gateError = "";
  err.className = "gate-error";
  err.hidden = true;
  err.setAttribute("role", "alert");
  err.textContent = "もう一度どうぞ";

  const submit = document.createElement("button");
  submit.dataset.gateSubmit = "";
  submit.className = "btn-gate-submit";
  submit.textContent = "OK";
  submit.addEventListener("click", () => {
    if (checkAnswer(challenge, input.value)) {
      deps.onPass();
    } else {
      err.hidden = false;
    }
  });

  const cancel = document.createElement("button");
  cancel.dataset.gateCancel = "";
  cancel.className = "btn-gate-cancel";
  cancel.textContent = "もどる";
  cancel.addEventListener("click", () => deps.onCancel());

  root.append(note, q, input, err, submit, cancel);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/parental-gate.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/parental-gate.ts tests/karate/parental-gate.test.ts
git commit -m "feat(karate): parental gate (adult check) before sharing"
```

---

### Task 2: done-screen を「保存 → 保護者ゲート → 共有」導線に変更

現状の done-screen は「保存」ボタン押下で即 `onDownload()` を呼ぶ。これを「保存」押下 → 同じ root に保護者ゲートを描画 → 通過で `onShare()`、キャンセルで done-screen に戻す、に変える。後方互換のため既存 `onDownload` は残さず `onShare` にリネームする（呼び出し側は Task 3 で更新）。既存 `done-screen.test.ts` はこの新導線に合わせて更新する。

**Files:**
- Modify: `karate-trainer/src/ui/done-screen.ts`
- Test: `tests/karate/done-screen.test.ts`（既存を更新）

**Interfaces:**
- Consumes: `renderParentalGate`, `ParentalGateDeps`, `GateChallenge`（Task 1）
- Produces:
  - `DoneDeps` を変更:
    ```ts
    export interface DoneDeps {
      videoUrl: string;
      ext: string;
      stats: { time: string; drills: number; cues: number };
      onShare(): void;      // 旧 onDownload。保護者ゲート通過後に呼ばれる
      onAgain(): void;
      gateChallenge?: GateChallenge;  // テスト用に注入可能
    }
    ```
  - `renderDoneScreen(root, deps)` のシグネチャは不変。「保存」ボタンの `data-download` 属性は据え置き（既存 app.test.ts が done 画面検出に使用）。

- [ ] **Step 1: Update the failing test**

`tests/karate/done-screen.test.ts` を次に置き換え:

```ts
// @vitest-environment jsdom
// tests/karate/done-screen.test.ts
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";

it("shows stats and a save button", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:v");
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl.textContent).toContain("mp4");
});

it("save opens a parental gate; passing it fires onShare", () => {
  const root = document.createElement("div");
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    gateChallenge: { a: 2, b: 2, answer: 4 },
  });

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  // gate is now shown, share not yet called
  expect(root.querySelector("[data-gate-submit]")).not.toBeNull();
  expect(onShare).not.toHaveBeenCalled();

  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  input.value = "4";
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();
  expect(onShare).toHaveBeenCalledOnce();
});

it("cancelling the gate returns to the done screen", () => {
  const root = document.createElement("div");
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    gateChallenge: { a: 2, b: 2, answer: 4 },
  });
  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  root.querySelector<HTMLButtonElement>("[data-gate-cancel]")!.click();
  // back on done screen (save button present again), share never called
  expect(root.querySelector("[data-download]")).not.toBeNull();
  expect(onShare).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: FAIL（`onShare` 未対応 / 保存押下でゲートが出ない）

- [ ] **Step 3: Write minimal implementation**

`karate-trainer/src/ui/done-screen.ts` を次に置き換え:

```ts
import { renderParentalGate } from "../parental-gate";
import type { GateChallenge } from "../parental-gate";

export interface DoneDeps {
  videoUrl: string;
  ext: string;
  stats: { time: string; drills: number; cues: number };
  onShare(): void;
  onAgain(): void;
  gateChallenge?: GateChallenge;
}

export function renderDoneScreen(root: HTMLElement, deps: DoneDeps): void {
  root.textContent = "";
  root.className = "screen done";

  const video = document.createElement("video");
  video.setAttribute("src", deps.videoUrl);
  video.setAttribute("playsinline", "");
  video.controls = true;

  const stats = document.createElement("div");
  stats.className = "stats";
  const stat = (v: string | number, k: string) => {
    const el = document.createElement("div"); el.className = "stat";
    el.innerHTML = `<div class="v"></div><div class="k"></div>`;
    el.querySelector(".v")!.textContent = String(v);
    el.querySelector(".k")!.textContent = k;
    return el;
  };
  stats.append(stat(deps.stats.time, "時間"), stat(deps.stats.drills, "種目"), stat(deps.stats.cues, "掛け声"));

  const dl = document.createElement("button");
  dl.dataset.download = ""; dl.className = "btn-dl";
  dl.textContent = `⬇ 動画を保存 (.${deps.ext})`;
  dl.addEventListener("click", () => {
    // 共有の前に保護者ゲート。通過で onShare、キャンセルで done 画面へ戻す。
    renderParentalGate(root, {
      challenge: deps.gateChallenge,
      onPass: () => deps.onShare(),
      onCancel: () => renderDoneScreen(root, deps),
    });
  });

  const again = document.createElement("button");
  again.dataset.again = ""; again.className = "btn-again"; again.textContent = "もう一度 稽古する";
  again.addEventListener("click", () => deps.onAgain());

  root.append(video, stats, dl, again);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/done-screen.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/ui/done-screen.ts tests/karate/done-screen.test.ts
git commit -m "feat(karate): gate video save behind a parental check"
```

---

### Task 3: `app.ts` の保存アクションを DI 化

`app.ts` の `finishSession()` は done-screen に `onDownload` を渡し、その中で `<a download>` を直接組み立てている。これを「共有アクションを外部から注入」する形に変える。`KarateAppDeps` に `shareRecording(blob, ext)` を追加し、`finishSession()` は録画 blob と ext を保持して `onShare` でそれを呼ぶ。既定（Web）実装は既存の `<a download>` を使う関数を Task 5 の `main.ts` から注入する。既存 `app.test.ts` は `onDownload` を検査していないが、`deps` に新フィールドが増えるためモックへの追加が要る（既存3テストの `KarateApp` 生成箇所に `shareRecording` を足す）。

**Files:**
- Modify: `karate-trainer/src/app.ts`
- Modify: `tests/karate/app.test.ts`（deps モックに `shareRecording` 追加＋共有経路の 1 テスト追加）

**Interfaces:**
- Consumes: `renderDoneScreen` の新 `DoneDeps.onShare`（Task 2）
- Produces:
  - `KarateAppDeps` に追加: `shareRecording(blob: Blob, ext: string): Promise<void>`
  - `finishSession()` は録画 `blob` と `ext` を捕捉し、done-screen の `onShare` で `this.deps.shareRecording(blob, ext)` を呼ぶ（`void` で発火、失敗は握りつぶさずログ）。

- [ ] **Step 1: Write the failing test**

`tests/karate/app.test.ts` の各 `KarateApp` 生成に `shareRecording: vi.fn().mockResolvedValue(undefined)` を追加。さらに末尾に共有経路のテストを追加:

```ts
it("passes the recorded blob to shareRecording after the parental gate", async () => {
  const root = document.createElement("div");
  document.body.append(root);

  let loopCb: ((d: number) => void) | null = null;
  const store = new VoiceStore(memKv());
  await store.init();

  const shareRecording = vi.fn().mockResolvedValue(undefined);
  const recordedBlob = new Blob(["v"]);

  const app = new KarateApp(root, {
    voiceStore: store,
    audioSink: { playUrl: vi.fn().mockResolvedValue(undefined), beep: vi.fn().mockResolvedValue(undefined), speak: vi.fn().mockResolvedValue(undefined) },
    makeVideoRecorder: () => ({
      startCamera: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
      startRecording: vi.fn(),
      stop: vi.fn().mockResolvedValue(recordedBlob),
      fileExtension: () => "mp4",
    }),
    makeVoiceRecorder: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(new Blob()) }),
    wakeGuard: { acquire: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) },
    rafLoop: { start: (cb) => { loopCb = cb; }, stop: vi.fn() },
    shareRecording,
    menuOverride: [{ id: "a", name: "前蹴り", seconds: 2, kind: "drill" }],
  });
  await app.start();

  root.querySelector<HTMLButtonElement>("[data-start]")!.click();
  await new Promise((r) => setTimeout(r, 0));
  for (let t = 0; t < 2500; t += 250) loopCb!(250);
  await new Promise((r) => setTimeout(r, 0));

  // done screen shown → press save → clear the parental gate → share fires
  const save = root.querySelector<HTMLButtonElement>("[data-download]")!;
  save.click();
  const input = root.querySelector<HTMLInputElement>("[data-gate-input]")!;
  const q = root.querySelector<HTMLElement>("[data-gate-question]")!.textContent!;
  // parse "a + b = ?" and answer correctly
  const [a, b] = q.replace(/[^0-9+]/g, "").split("+").map(Number);
  input.value = String(a + b);
  root.querySelector<HTMLButtonElement>("[data-gate-submit]")!.click();

  expect(shareRecording).toHaveBeenCalledOnce();
  expect(shareRecording.mock.calls[0][0]).toBe(recordedBlob);
  expect(shareRecording.mock.calls[0][1]).toBe("mp4");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/app.test.ts`
Expected: FAIL（`shareRecording` 未配線 / done-screen が `onShare` を呼ばない）

- [ ] **Step 3: Write minimal implementation**

`karate-trainer/src/app.ts` を次のように変更:

1. `KarateAppDeps` インターフェースに追加:

```ts
  // 録画の共有（native → シェアシート / web → <a download>）。
  // platform.ts から注入される。
  shareRecording(blob: Blob, ext: string): Promise<void>;
```

2. `finishSession()` 内の `renderDoneScreen(...)` 呼び出しを、blob と ext を捕捉して `onShare` に配線する形へ置き換え（`onDownload` を削除）:

```ts
    const blobForShare = blob;
    renderDoneScreen(this.root, {
      videoUrl,
      ext,
      stats: {
        time: formatMMSS(elapsedSeconds),
        drills: this.drillCount,
        cues: this.cueCount,
      },
      onShare: () => {
        void this.deps.shareRecording(blobForShare, ext).catch((e) => {
          console.error("shareRecording failed", e);
        });
      },
      onAgain: () => {
        this.sessionEnding = false;
        this.videoRecorder = null;
        this.scheduler = null;
        this.showSetup();
      },
    });
```

（`blob` は既に `const blob = recorder ? await recorder.stop() : new Blob();` で得ているので、そのまま `blobForShare` に束ねる。旧 `onDownload` の `<a>` 生成ブロックは削除。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/app.test.ts`
Expected: PASS（既存3 + 新規1 = 4 tests）

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/app.ts tests/karate/app.test.ts
git commit -m "feat(karate): inject shareRecording, wire done-screen onShare"
```

---

### Task 4: プラットフォーム分岐 (`platform.ts`)

ネイティブ/Web の差分を 1 ファイルに隔離する。`makeWakeGuard()` と `shareRecording()` を返す。判定は `Capacitor.isNativePlatform()` だが、テスト容易性のため「判定関数」を注入可能にする。native 実装は Capacitor プラグインを動的 import し、web 実装は既存 `WakeGuard` と `<a download>` を使う。ユニットテストでは判定を差し替えて「どちらの分岐を選ぶか」を検証する（実プラグイン動作は実機で確認）。

**Files:**
- Create: `karate-trainer/src/platform.ts`
- Test: `tests/karate/platform.test.ts`

**Interfaces:**
- Consumes: `WakeGuard`（既存 `wake-lock.ts`）, `WakeGuardLike`（`app.ts` からの型）
- Produces:
  - `export interface PlatformDeps { isNative?: () => boolean }`
  - `export function makeWakeGuard(deps?: PlatformDeps): WakeGuardLike` — native なら keep-awake ベース、web なら `new WakeGuard()`。
  - `export function shareRecording(blob: Blob, ext: string, deps?: PlatformDeps): Promise<void>` — native なら Capacitor Filesystem+Share、web なら `<a download>`。
  - どちらも `deps.isNative` が未指定なら `Capacitor.isNativePlatform` を使う（動的 import。テストでは常に `isNative` を注入するので Capacitor 本体は読み込まれない）。

**注記:** テストは「web 分岐」の観測可能な副作用（`<a download>` クリックが起きる）と、「native 分岐選択時に web の副作用が起きない」ことを検証する。native 実装のプラグイン呼び出し自体はユニットtestでは検証しない（実機テスト項目）。

- [ ] **Step 1: Write the failing test**

`tests/karate/platform.test.ts`:

```ts
// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { makeWakeGuard, shareRecording } from "../../karate-trainer/src/platform";

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

it("makeWakeGuard on web returns an object with acquire/release", async () => {
  const g = makeWakeGuard({ isNative: () => false });
  expect(typeof g.acquire).toBe("function");
  expect(typeof g.release).toBe("function");
  // web WakeGuard no-ops safely when wakeLock is unavailable in jsdom
  await expect(g.acquire()).resolves.toBeUndefined();
  await expect(g.release()).resolves.toBeUndefined();
});

it("shareRecording on web triggers an <a download> click", async () => {
  const clicks: HTMLAnchorElement[] = [];
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreate(tag) as HTMLElement;
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => { clicks.push(el as HTMLAnchorElement); };
    }
    return el as any;
  });

  await shareRecording(new Blob(["v"]), "mp4", { isNative: () => false });

  expect(clicks.length).toBe(1);
  expect(clicks[0].download).toContain("mp4");
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/karate/platform.test.ts`
Expected: FAIL（`platform` 未作成）

- [ ] **Step 3: Write minimal implementation**

`karate-trainer/src/platform.ts`:

```ts
import { WakeGuard } from "./wake-lock";
import type { WakeGuardLike } from "./app";

export interface PlatformDeps {
  isNative?: () => boolean;
}

// 実機判定。テストでは deps.isNative を注入するのでここは呼ばれない。
async function detectNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function makeWakeGuard(deps: PlatformDeps = {}): WakeGuardLike {
  const isNative = deps.isNative;
  if (isNative ? isNative() : false) {
    // ネイティブ: keep-awake プラグイン。プラグインは実機でのみ読み込む。
    return {
      async acquire() {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        try { await KeepAwake.keepAwake(); } catch { /* ignore */ }
      },
      async release() {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        try { await KeepAwake.allowSleep(); } catch { /* ignore */ }
      },
    };
  }
  // Web: 既存の WakeGuard（jsdom / 非対応環境では no-op）
  return new WakeGuard();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export async function shareRecording(blob: Blob, ext: string, deps: PlatformDeps = {}): Promise<void> {
  const isNative = deps.isNative;
  const native = isNative ? isNative() : await detectNative();

  if (native) {
    // ネイティブ: 一時ファイルに書き出し → OS シェアシート。
    // 保存先（写真/ファイル/AirDrop 等）はユーザーがシートで選ぶ。
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const fileName = `karate-training.${ext}`;
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: Directory.Cache,
    });
    await Share.share({ title: "空手稽古", url: written.uri });
    return;
  }

  // Web: 既存の <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `karate-training.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/karate/platform.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
git add karate-trainer/src/platform.ts tests/karate/platform.test.ts
git commit -m "feat(karate): platform.ts isolates native/web (keep-awake, share)"
```

---

### Task 5: `main.ts` を配線 + Capacitor 依存とスクリプト

`main.ts` で `new WakeGuard()` を `makeWakeGuard()` に、そして `shareRecording` を `deps` に配線する。加えて Capacitor 依存を `package.json` に追加し、cap スクリプトを用意する。`main.ts` はブラウザ実行専用でユニットテスト対象外（既存 `main.ts` にもテストなし）なので、このタスクの検証は「型が通ってビルドできる」＋「既存の空手テスト全通過」。

**Files:**
- Modify: `karate-trainer/src/main.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `makeWakeGuard`, `shareRecording`（Task 4）
- Produces: なし（配線のみ）

- [ ] **Step 1: Capacitor 依存を追加**

Run:
```bash
npm i @capacitor/core@^8 @capacitor/ios@^8 @capacitor-community/keep-awake@^8 @capacitor/share @capacitor/filesystem
npm i -D @capacitor/cli@^8
```
Expected: インストール成功。`package.json` に依存が入る。（ネットワーク不通ならその旨を報告して停止。）

- [ ] **Step 2: `main.ts` を配線**

`karate-trainer/src/main.ts` を編集:
- import を変更: `import { WakeGuard } from "./wake-lock";` を削除し、
  `import { makeWakeGuard, shareRecording } from "./platform";` を追加。
- `KarateApp` の deps: `wakeGuard: new WakeGuard(),` を `wakeGuard: makeWakeGuard(),` に、
  そして `shareRecording,` を deps に追加。

結果の deps 部分:

```ts
const app = new KarateApp(root, {
  voiceStore: store,
  audioSink: new BrowserAudioSink(),
  makeVideoRecorder: () => new VideoRecorder(),
  makeVoiceRecorder: () => new VoiceRecorder(),
  wakeGuard: makeWakeGuard(),
  rafLoop,
  shareRecording,
});
```

- [ ] **Step 3: `package.json` に cap スクリプトを追加**

`scripts` に追記:

```jsonc
    "cap:sync": "npm run build:karate && cap sync ios",
    "cap:open": "cap open ios",
    "ios": "npm run build:karate && cap sync ios && cap open ios"
```

- [ ] **Step 4: 型チェック＋全テスト**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/karate/`
Expected: 型エラーなし。空手テスト全通過（Task 1–4 の新規分を含む）。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json karate-trainer/src/main.ts
git commit -m "feat(karate): wire makeWakeGuard/shareRecording; add Capacitor deps"
```

---

### Task 6: `capacitor.config.ts` + iOS プロジェクト生成 + Info.plist

Capacitor 設定を作り、`dist` をビルドし、iOS プロジェクトを生成して権限説明文を入れる。WSL では `pod install` が失敗する想定（spec §14）。`ios/` フォルダが生成されたら成功扱いとし、pod install 以降は Mac の残タスクとする。

**Files:**
- Create: `karate-trainer/capacitor.config.ts`
- Create: `karate-trainer/ios/`（`npx cap add ios` で自動生成）
- Modify: `karate-trainer/ios/App/App/Info.plist`（生成後に権限文追記）

**Interfaces:** なし（設定・生成のみ）

- [ ] **Step 1: `capacitor.config.ts` を作成**

`karate-trainer/capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ushimaru.karatetrainer",
  appName: "空手稽古",
  webDir: "dist",
  server: {
    // getUserMedia / MediaRecorder / IndexedDB は secure context 必須。
    iosScheme: "https",
  },
};

export default config;
```

- [ ] **Step 2: web 資産をビルド**

Run: `npm run build:karate`
Expected: `karate-trainer/dist/` が生成される（`ls karate-trainer/dist/index.html` で確認）。

- [ ] **Step 3: iOS プロジェクトを生成**

Run: `npx cap add ios`
Expected: `karate-trainer/ios/` が生成される。**WSL では末尾の `pod install` が失敗しうる**が、それは想定内。次で存在を確認する。

- [ ] **Step 4: 生成結果を確認**

Run: `ls karate-trainer/ios/App/App/Info.plist && echo OK`
Expected: `Info.plist` が存在し `OK` が出る。
- 出ない場合（`cap add ios` が WSL で `ios/` を作れなかった場合）: spec §14 のフォールバックに従い、`ios/` 生成は Mac 側の残タスクとして README に明記し、このタスクの Step 5（Info.plist 追記）はスキップして Step 6 のコミット（config のみ）に進む。その旨をレビューで報告する。

- [ ] **Step 5: Info.plist に権限説明文を追記**

`karate-trainer/ios/App/App/Info.plist` の最上位 `<dict>` 内に以下を追加:

```xml
	<key>NSCameraUsageDescription</key>
	<string>稽古の様子を録画するためにカメラを使用します。動画はこの端末内にのみ保存されます。</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>稽古の音声とかけ声を録音するためにマイクを使用します。音声はこの端末内にのみ保存されます。</string>
```

（シェアシート方式のため `NSPhotoLibraryAddUsageDescription` は追加しない。）

- [ ] **Step 6: Commit**

```bash
git add karate-trainer/capacitor.config.ts karate-trainer/ios
git commit -m "chore(karate): add capacitor.config + generated iOS project + permissions"
```

**注:** ルート `.gitignore` は `dist/` を無視している。`cap sync`（Mac 側）が
`dist` を iOS プロジェクトへコピーするので `dist/` 自体をコミットする必要はない。
`ios/` が WSL で未生成の場合（Step 4 参照）は `karate-trainer/capacitor.config.ts`
のみをコミットし、`ios/` 生成は Mac 側の残タスクとして README に明記する。

---

### Task 7: プライバシーポリシー原稿 + README（iOS 手順・審査ノート・チェックリスト）

App Store 提出に必要な文書を用意する。プライバシーポリシー原稿（日英）と、README への iOS ビルド手順・審査ノート雛形・実機チェックリスト追記。

**Files:**
- Create: `karate-trainer/privacy-policy.md`
- Modify: `karate-trainer/README.md`

**Interfaces:** なし（ドキュメント）

- [ ] **Step 1: プライバシーポリシー原稿を作成**

`karate-trainer/privacy-policy.md`（日英併記。spec §9 の趣旨を反映）:

```markdown
# プライバシーポリシー / Privacy Policy — 空手稽古 (Karate Trainer)

最終更新 / Last updated: 2026-08-28

## 日本語

「空手稽古」は、個人情報を収集・送信・販売・共有しません。

- **カメラと動画**: 子ども自身が稽古を録画するためにカメラを使用します。
  録画した動画は**この端末内にのみ**保存されます。動画がアップロードされたり、
  開発者や第三者がアクセスすることは一切ありません。共有する場合も、端末の
  共有機能を通じてご自身が選んだ相手にのみ送られます。
- **アカウント・分析・広告なし**: ユーザー登録、利用状況の分析、広告、第三者
  トラッキング SDK は一切ありません。
- **お問い合わせ**: <入力してください: 連絡先メールアドレス>

## English

Karate Trainer does not collect, transmit, sell, or share any personal information.

- **Camera & video**: The app uses the camera so the child can film their own
  practice. All videos are stored **only on your device**. Videos are never
  uploaded and are never accessible to the developer or any third party. If you
  choose to share a video, it is sent only via your device's share sheet to a
  recipient you pick.
- **No accounts, analytics, or ads**: No user accounts, no usage analytics, no
  advertising, no third-party tracking SDKs.
- **Contact**: <FILL IN: contact email>
```

（`<入力してください>` は連絡先メールという**ユーザー入力必須項目**であることを README に明記する。プレースホルダはこの1箇所のみで、ユーザー固有情報なので Claude が埋めない。）

- [ ] **Step 2: README に iOS セクションを追記**

`karate-trainer/README.md` の末尾に追加:

```markdown
## iOS ネイティブアプリ (Capacitor)

このアプリは Capacitor で iOS ネイティブアプリ化できます。設計の詳細は
`docs/superpowers/specs/2026-08-27-karate-trainer-ios-design.md` を参照。

### ビルド手順

WSL 側（Mac 不要):
1. `npm run build:karate` — web 資産を `dist/` に生成
2. `npx cap add ios` — iOS プロジェクトを生成（WSL では末尾の pod install が
   失敗しうるが想定内。`ios/App/App/Info.plist` ができていれば OK）

Mac 側（必須):
3. `npm run cap:sync` — `dist` を iOS へ同期し `pod install` 実行
4. `npm run cap:open` — Xcode で `ios/App/App.xcworkspace` を開く
5. 署名（Apple Developer 登録が必要, $99/年）→ 実機ビルド → App Store 提出
   - **Xcode 26 + iOS 26 SDK 必須**（2026/4/28 以降の提出要件）

### App Store 提出前チェック（審査で落ちないために）

- [ ] プライバシーポリシー (`privacy-policy.md`) の連絡先メールを埋め、
      GitHub Pages 等で**公開 URL** にして App Store Connect に登録
- [ ] サポート URL を用意
- [ ] App Privacy 質問票は **"Data Not Collected"**（端末内処理のみ）
- [ ] 年齢レーティング質問票: 社会性機能=なし / UGC 配信=なし → 4+ を維持
- [ ] アプリ名・説明文・スクショで **"For Kids" / "子ども向け" を使わない**
      （Guideline 2.3.8。「親子で」「空手の自主練習」等に）
- [ ] **審査ノート**に記載:「録画動画は端末外に送信されない。カメラ録画・
      画面スリープ防止・共有シートなどネイティブ機能を使用」
- [ ] 本番アイコン画像を差し替え

### 実機テスト（Mac + iPhone 必須、既存チェックリストに追加）

- [ ] カメラ/マイク権限プロンプトが起動時に出る（Info.plist の説明文が表示される）
- [ ] 画面が稽古中スリープしない（keep-awake が効く）
- [ ] 「動画を保存」→ 保護者ゲート（足し算）→ 正解でシェアシートが開く
- [ ] シェアシートから写真アプリ/ファイル/AirDrop に動画を渡せる
- [ ] 保護者ゲートをキャンセルすると done 画面に戻る
```

- [ ] **Step 3: 全テスト最終確認**

Run: `npx vitest run tests/karate/`
Expected: 空手テスト全通過。

- [ ] **Step 4: Commit**

```bash
git add karate-trainer/privacy-policy.md karate-trainer/README.md
git commit -m "docs(karate): privacy policy draft + iOS build/review checklist"
```

---

## 完了時の状態

- Web 版は従来通り動作（`npm run dev:karate`）。
- iOS 版は `dist` を Capacitor が取り込み、Mac で Xcode を開けばビルド・提出可能。
- ネイティブ差分は `platform.ts` 1ファイルに隔離。コアロジック無変更。
- 動画共有は保護者ゲートの背後。動画は端末外に自動送信されない。
- プライバシーポリシー原稿・審査ノート雛形・実機チェックリスト完備。
- ユーザーの残タスク（Mac 必須）は README と spec §13 に明記済み。
