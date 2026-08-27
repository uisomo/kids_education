# 空手稽古 (Karate Trainer) — iOS ネイティブアプリ化 設計書

- 日付: 2026-08-27
- 対象: `karate-trainer/`（バニラ TypeScript + Vite のクライアントサイド Web アプリ）
- ゴール: App Store 提出可能な iOS ネイティブアプリにする。ただし今回は
  **Mac に持っていけば即ビルド・提出できる状態まで** を WSL 上で仕上げる。
- 方式: **Capacitor でラップ**（Web 資産をネイティブ WebView に埋め込む）

## 1. 背景と現状

`karate-trainer/` は既に iPhone Safari 前提で作られた縦画面専用アプリ。
サーバー不要で全処理がクライアント側。依存するブラウザ機能:

- `getUserMedia`（前面カメラ + マイク）
- `MediaRecorder`（セッション録画。mp4 優先、webm フォールバック）
- Web Audio / TTS（かけ声・励まし・カウントダウン）
- `navigator.wakeLock`（画面スリープ防止）
- `IndexedDB`（録音した声クリップの永続化）
- `localStorage`（メニュー・プリセットの永続化）

依存性注入 (DI) が効いており、ブラウザ API は `VideoRecorderLike` /
`WakeGuardLike` / `onDownload` コールバック等のインターフェース越しに
抽象化されている。コアロジック（`app.ts`, `scheduler.ts`,
`cue-player.ts`, `ui/*`）は具体的なブラウザ API を直接は知らない。

## 2. 採用アプローチ: Capacitor ラップ

既存 Web アプリ（`vite build` の出力 `dist/`）を Capacitor が生成する
iOS ネイティブアプリの WKWebView に取り込む。Web 版・iOS 版で **同一
ソースコードを共有** する。

不採用: Swift/SwiftUI での再実装。既存資産を捨てる工数が過大で、
現アプリの完成度に見合わない (YAGNI)。

## 3. WKWebView 上での機能適合性（調査済み）

| 機能 | WKWebView での挙動 | 対応 |
|---|---|---|
| getUserMedia | 動くが `Info.plist` に権限説明文が必須 | 権限文を追記 + `allowsInlineMediaPlayback` |
| MediaRecorder | mp4 対応が不安定な場合あり。既存は webm フォールバック有り | 実機テストで確認（コードは既に堅牢） |
| Web Audio / TTS | 動く | 変更なし |
| `navigator.wakeLock` | **iOS WebView では無効**（`WakeGuard` は無言でスキップ） | `@capacitor-community/keep-awake` に差し替え → むしろ改善 |
| IndexedDB / localStorage | 動く（iOS が稀に自動削除） | 変更なし。既存のエクスポート/インポートが保険 |
| 録画の保存 (`<a download>`) | iOS ネイティブに DL フォルダなし | ネイティブ時はカメラロール（写真アプリ）へ保存 |
| top-level await (`main.ts`) | Vite が処理 | 変更なし |

## 4. アーキテクチャ / ファイル構成

```
karate-trainer/
├─ src/
│   ├─ platform.ts        ★新規: ネイティブ/Web 分岐を集約する唯一の場所
│   ├─ main.ts            変更: makeWakeGuard() と saveRecording() を配線
│   ├─ app.ts             微調整: onDownload を呼び出し側から差し替え可能に
│   └─ (その他コアは無変更)
├─ dist/                  vite build 出力（cap が取り込む）
├─ capacitor.config.ts    ★新規: appId/appName/WebView 設定
├─ ios/                   ★新規(自動生成): Xcode プロジェクト
│   └─ App/App/Info.plist    権限説明文を追記
└─ package.json           Capacitor 依存 + cap スクリプト追加
```

ビルドフロー:
`npm run build:karate` → `dist/` → `npx cap sync ios` → (Mac) Xcode で
ビルド → 実機 / App Store。

## 5. プラットフォーム分岐の隔離

`Capacitor.isNativePlatform()` の判定を全体にばら撒かず、`platform.ts`
1ファイルに閉じ込める。ここだけが Capacitor を import する。

```ts
// platform.ts — ネイティブ/Web の違いを知る唯一の場所
export function makeWakeGuard(): WakeGuardLike
  // native → keep-awake プラグイン / web → 既存 WakeGuard
export function saveRecording(blob: Blob, ext: string): Promise<void>
  // native → 写真ライブラリへ保存 / web → 既存の <a download>
```

`main.ts` はファクトリを呼ぶだけ。`app.ts` 以下は `WakeGuardLike`
インターフェースと `onDownload` コールバックを受け取るのみで、中身が
ネイティブか Web かを知らない（既存 DI をそのまま活用）。

## 6. 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `src/platform.ts` | 新規。分岐を全集約 |
| `src/main.ts` | `new WakeGuard()`→`makeWakeGuard()`、`onDownload`に`saveRecording`配線 |
| `src/app.ts` | `onDownload` を外部から差し替え可能に微調整 |
| `capacitor.config.ts` | 新規 |
| `package.json` | Capacitor 依存 + `cap:sync` 等スクリプト |
| `ios/` 一式 | 新規(自動生成)、`Info.plist` に権限文追記 |

**無変更**: `scheduler.ts`, `cue-player.ts`, `ui/*`, `voice-store.ts`,
`recorder.ts`, `voice-recorder.ts`, `audio-sink.ts`, `menu-store.ts`,
`preset-store.ts`, `types.ts`。

## 7. 設定値

- Bundle ID (appId): `com.ushimaru.karatetrainer`
- App 名 (appName): `空手稽古`
- `NSCameraUsageDescription`: 「稽古の様子を録画するためにカメラを使用します」
- `NSMicrophoneUsageDescription`:
  「稽古の音声を録音し、かけ声を録音するためにマイクを使用します」
- 写真保存のため `NSPhotoLibraryAddUsageDescription`:
  「録画した稽古動画を写真アプリに保存します」
- WebView: `allowsInlineMediaPlayback: true`

## 8. テスト方針

- 既存 vitest（jsdom）はコアロジックを検証済み。無変更部分はそのまま通る。
- `app.ts` の `onDownload` 微調整は既存テストで守る（TDD で着手）。
- `platform.ts` は分岐ロジック（isNativePlatform の true/false でどちらの
  実装を返すか）を注入可能にしてユニットテスト。実ネイティブ動作は実機に委ねる。
- 実機テスト（Mac 必須）: `karate-trainer/README.md` の手動チェックリストを消化。

## 9. 作業手順（WSL 上で実施）

1. Capacitor 依存追加（core, cli, ios, keep-awake, 写真保存プラグイン）
2. `capacitor.config.ts` 作成
3. TDD: `app.ts` の `onDownload` 差し替え化 → `platform.ts` 新規
4. `main.ts` 配線
5. `npm run build:karate`
6. `npx cap add ios`（iOS プロジェクト生成）
7. `Info.plist` に権限説明文追記
8. アイコン/スプラッシュのプレースホルダ配置（後で差し替え可能に）
9. `npx cap sync ios`
10. vitest 全通過 + README に iOS ビルド手順追記

## 10. 成果物

「Mac に持っていって Xcode で `ios/App/App.xcworkspace` を開けば、
そのままビルド → 実機起動 → App Store 提出できる」状態の `ios/`
プロジェクト一式と、共有ソースの分岐対応。

## 11. ユーザーの残タスク（Mac 必須 / Claude 代行不可）

- Apple Developer Program 登録（$99/年）
- Mac の Xcode で `ios/App/App.xcworkspace` を開く
- 署名証明書の設定（Xcode が大半を自動化）
- 実機での動作確認（README チェックリスト）
- 本番アイコン画像、App Store 説明文・スクショ・審査提出

## 12. リスク開示

- `npx cap add ios` は WSL(Linux) で **生成自体はできる可能性が高い** が、
  iOS 向けツールは本来 macOS 前提。WSL で失敗した場合は「Capacitor 設定・
  権限記述・分岐コードまで完成させ、`npx cap add ios` は Mac 側で1回叩く」
  手順書を残す形に切り替える。やってみて、ダメなら正直に報告する。
- 録画・カメラ・keep-awake の最終動作は Mac がないと検証不能。保証できるのは
  「コードとプロジェクト構成が正しく整っている」ところまで。
