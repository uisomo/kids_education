# 空手稽古 (Karate Trainer) — iOS ネイティブアプリ化 設計書

- 日付: 2026-08-27（研究に基づき全面改訂）
- 対象: `karate-trainer/`（バニラ TypeScript + Vite のクライアントサイド Web アプリ）
- ゴール: App Store 提出可能な iOS ネイティブアプリにする。今回は
  **Mac に持っていけば即ビルド・提出できる状態まで** を WSL 上で仕上げる。
- 方式: **Capacitor 8.x でラップ**（Web 資産をネイティブ WKWebView に埋め込む）
- 位置づけ: **子ども・ファミリー向けアプリ**。ただし App Store の
  **Made for Kids カテゴリには登録せず、通常の 4+ アプリ**として出す。

## 0. この設計を貫く絶対不変条件（研究で確定）

> **録画した動画は端末外に一切送信しない。**

これがコンプライアンスの土台。研究の結論:
- 動画が端末外に出ない限り、米 COPPA も日本 APPI も**法的義務を課さない**
  （「収集」の定義が「オンライン送信」前提のため。端末内保存は「収集」に非該当）。
  出典: [16 CFR §312.2](https://www.law.cornell.edu/cfr/text/16/312.2),
  [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- クラウドバックアップ・サーバ送信・分析・広告を **1つでも足した瞬間**、
  COPPA が発動し全く別の重い規制世界（保護者同意取得等）に入る。
- したがって「動画は端末内のみ」は**機能追加時に必ず守るべき設計制約**として
  本書に明記し、将来もこの一線を越えない。

## 1. 背景と現状

`karate-trainer/` は既に iPhone Safari 前提の縦画面専用アプリ。サーバ不要で
全処理がクライアント側。依存するブラウザ機能:

- `getUserMedia`（前面カメラ + マイク）
- `MediaRecorder`（セッション録画。mp4 優先、webm フォールバック）
- Web Audio / `speechSynthesis` TTS（かけ声・励まし・カウントダウン）
- `navigator.wakeLock`（画面スリープ防止）※ iOS WKWebView では**無効**
- `IndexedDB`（録音した声クリップの永続化）
- `localStorage`（メニュー・プリセットの永続化）
- `<a download>` によるファイル保存 ※ iOS WKWebView では**無効**

DI が効いており、ブラウザ API は `VideoRecorderLike` / `WakeGuardLike` /
`onDownload` コールバック等のインターフェース越しに抽象化されている。コア
ロジック（`app.ts`, `scheduler.ts`, `cue-player.ts`, `ui/*`）は具体的な
ブラウザ API を直接は知らない。

## 2. 採用アプローチ: Capacitor ラップ

既存 Web アプリ（`vite build` の出力 `dist/`）を Capacitor が生成する iOS
ネイティブアプリの WKWebView に **ローカルバンドル**として取り込む。Web版・
iOS版で**同一ソースコードを共有**する。

不採用: Swift/SwiftUI 再実装（既存資産を捨てる工数が過大、YAGNI）。

## 3. WKWebView 上での機能適合性（研究で検証済み）

| 機能 | WKWebView での挙動 | 対応 |
|---|---|---|
| getUserMedia (cam+mic) | 動く(iOS15+)。ただし secure context 必須 | `server.iosScheme: 'https'` + Info.plist 権限文 |
| MediaRecorder mp4 | 動く（全 iOS で対応の安全側） | mp4 優先を維持。webm はハードコードしない |
| MediaRecorder webm | iOS 18.4+ のみ | フォールバック専用 |
| Web Audio / speechSynthesis | 動く | autoplay はユーザー操作後に解錠 |
| `navigator.wakeLock` | **iOS で無効** | `@capacitor-community/keep-awake` 8.x に差替 → 改善 |
| IndexedDB / localStorage | 動く（secure context） | 変更なし。iOS が稀に自動削除するため export/import が保険 |
| `<a download>` blob 保存 | **iOS で無効**（download 属性を無視） | シェアシート（`@capacitor/share`）へ差替 |
| top-level await (`main.ts`) | Vite が処理 | 変更なし |

## 4. App Store 審査コンプライアンス要件（研究で確定）

「子ども向けだが Made for Kids には入れない、通常 4+ アプリ」でも、
以下は**守らないとリジェクトされる**（HARD）または強く推奨。

出典: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

**HARD（欠けるとリジェクト）:**
1. **プライバシーポリシーを公開 URL に用意**し、App Store Connect に登録。
   Apple は全アプリに必須（データ収集ゼロでも）。§9 に最小テンプレを収録。
2. **App Privacy 質問票は「Data Not Collected」**で申告。端末内処理のみは
   Apple 定義で「収集」に非該当。ポリシー文言と齟齬を出さない。
3. **明確なカメラ/マイク/共有の用途説明文**（Info.plist）。曖昧・空文字は 5.1.1 で拒否。
4. **データ最小化**（5.1.1 iii）。広い写真ライブラリ書込権限より
   **out-of-process のシェアシート**を優先 → 写真ライブラリ権限自体を要求しない。
5. **メタデータで "For Kids"/"子ども向け" 等の語を使わない**（2.3.8。
   これらは Made for Kids 専用語）。「ファミリー」「親子」「練習」等に置換。
6. **サポート URL を有効に**（1.5。切れリンクは頻出リジェクト）。

**強く推奨:**
7. **動画の共有は保護者ゲート（大人向けの簡単な確認、例: 計算問題）の背後に置く。**
   子どもが誤って外部共有しない安全設計。審査官の心証も良い。
8. **Guideline 4.2（web ラッパー拒否）対策**: ネイティブ機能（カメラ録画・
   keep-awake・シェアシート）を審査ノートに明記。ローカルバンドルなので
   4.2 の主要トリガー（リモート URL 読み込みだけの薄いラッパー）は回避済み。

**なぜ Made for Kids に入れないか（研究の判断根拠）:**
- Made for Kids は**一方通行のドア**（一度承認されると外せず、全更新が
  キッズ規則に縛られ、第三者分析・広告 SDK は実質全面禁止）。
- 将来のクラウド/共有機能追加の柔軟性を残すため、通常 4+ を選ぶ。
- 通常 4+ でも上記 1〜8 を満たせば子ども向けとして安全に出せる。

## 5. アーキテクチャ / ファイル構成

```
karate-trainer/
├─ src/
│   ├─ platform.ts        ★新規: ネイティブ/Web 分岐を集約する唯一の場所
│   ├─ parental-gate.ts   ★新規: 保護者ゲート（共有前の大人確認）
│   ├─ main.ts            変更: makeWakeGuard()/shareRecording() を配線
│   ├─ app.ts             微調整: 保存アクションを外部から差し替え可能に
│   ├─ ui/done-screen.ts  微調整: 「保存」→ゲート→共有 の導線
│   └─ (その他コアは無変更)
├─ dist/                  vite build 出力（cap が webDir として取り込む）
├─ capacitor.config.ts    ★新規: appId/appName/webDir/iosScheme
├─ ios/                   ★新規(自動生成): Xcode プロジェクト
│   └─ App/App/Info.plist    権限説明文を追記
├─ privacy-policy.md      ★新規: 公開ポリシー原稿（日英）。公開 URL 化は要ホスティング
└─ package.json           Capacitor 依存 + cap スクリプト追加
```

ビルドフロー:
`npm run build:karate` → `dist/` → `npx cap sync ios`（Mac で pod install）
→ Xcode でビルド → 実機 / App Store。

## 6. プラットフォーム分岐の隔離

`Capacitor.isNativePlatform()` を全体にばら撒かず、`platform.ts` 1ファイルに
閉じ込める。ここだけが Capacitor を import する。

```ts
// platform.ts — ネイティブ/Web の違いを知る唯一の場所
export function makeWakeGuard(): WakeGuardLike
  // native → @capacitor-community/keep-awake / web → 既存 WakeGuard
export function shareRecording(blob: Blob, ext: string): Promise<void>
  // native → 一時ファイル書出し + @capacitor/share でシェアシート
  //          （写真保存/AirDrop/ファイル/共有はユーザーがシートで選ぶ）
  // web    → 既存の <a download>
```

`main.ts` はファクトリを呼ぶだけ。`app.ts` 以下は `WakeGuardLike` と保存
コールバックを受け取るのみで、中身がネイティブか Web かを知らない（既存 DI 活用）。

**なぜ写真ライブラリ直保存でなくシェアシートか（研究より修正）:**
Apple のデータ最小化要件（5.1.1 iii）は「広い写真ライブラリ権限より
out-of-process picker / share sheet を優先せよ」と明記。シェアシートなら
`NSPhotoLibraryAddUsageDescription` 権限すら不要で、保存先（写真/ファイル/
AirDrop 等）はユーザーが選べる。審査リスクが最小。

## 7. 保護者ゲート (`parental-gate.ts`)

- done-screen の「保存/共有」ボタン → まず保護者ゲートを表示 → 通過後に
  `shareRecording()` を呼ぶ。
- ゲートは**大人向けの簡単な確認**（例: 2桁の足し算 or 「長押し3秒」等、
  未就学児が容易にできない操作）。文言例:「おうちの人にわたしてね」。
- ゲート自体は純ロジック（入力→正誤）でユニットテスト可能に切り出す。
- Made for Kids ではないため厳密な Apple 必須ではないが、子ども向け安全設計
  として採用（§4-7）。

## 8. 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `src/platform.ts` | 新規。分岐を全集約（keep-awake / share） |
| `src/parental-gate.ts` | 新規。共有前の保護者確認（ロジック + 最小 UI） |
| `src/main.ts` | `makeWakeGuard()` と `shareRecording()` を配線 |
| `src/app.ts` | 保存アクションを外部から差し替え可能に微調整 |
| `src/ui/done-screen.ts` | 「保存」ボタン→ゲート→共有 の導線に微調整 |
| `capacitor.config.ts` | 新規 |
| `privacy-policy.md` | 新規（日英）。公開ホスティングは §11 で実施 |
| `package.json` | Capacitor 依存 + `cap:sync`/`cap:open` 等スクリプト |
| `ios/` 一式 | 新規(自動生成)、`Info.plist` に権限文追記 |

**無変更**: `scheduler.ts`, `cue-player.ts`, `ui/setup-screen.ts`,
`ui/training-screen.ts`, `ui/voice-screen.ts`, `voice-store.ts`,
`recorder.ts`, `voice-recorder.ts`, `audio-sink.ts`, `menu-store.ts`,
`preset-store.ts`, `wake-lock.ts`(web用に残す), `types.ts`。

## 9. 設定値・文言

- Bundle ID (appId): `com.ushimaru.karatetrainer`
- App 名 (appName): `空手稽古`
- Capacitor: `@capacitor/core@^8`, `@capacitor/ios@^8`, `@capacitor/cli@^8`(dev),
  `@capacitor-community/keep-awake@^8`, `@capacitor/share`, `@capacitor/filesystem`
- `capacitor.config.ts`（要点）: `webDir: 'dist'`, `server.iosScheme: 'https'`
- Info.plist 用途説明文（日本語、審査で表示される）:
  - `NSCameraUsageDescription`:
    「稽古の様子を録画するためにカメラを使用します。動画はこの端末内にのみ保存されます」
  - `NSMicrophoneUsageDescription`:
    「稽古の音声とかけ声を録音するためにマイクを使用します。音声はこの端末内にのみ保存されます」
  - （シェアシート方式のため `NSPhotoLibraryAddUsageDescription` は原則不要）
- **メタデータ禁止語**: "For Kids", "子ども向け", "For Children"。
  代替: 「親子で」「ファミリー」「空手の自主練習」等。
- 最小プライバシーポリシー原稿（`privacy-policy.md`、日英併記。要点）:
  「本アプリは個人情報を収集・送信・共有しません。カメラ/マイクは端末内で
  動画を録るためだけに使い、動画は端末内にのみ保存されます。アカウント・
  分析・広告・第三者 SDK はありません。」

## 10. テスト方針（TDD）

- 既存 vitest（jsdom）はコアロジック検証済み。無変更部分はそのまま通る。
- **TDD 対象（新規/変更）:**
  - `parental-gate.ts` の正誤判定ロジック（純ロジック）→ 先にテスト。
  - `platform.ts` の分岐（isNativePlatform の true/false でどちらの実装を
    返すか）→ 判定関数を注入可能にしてユニットテスト。
  - `app.ts` の保存アクション差替 → 既存テストで回帰を守りつつ拡張。
- 実ネイティブ動作（カメラ・録画・keep-awake・シェアシート）は実機テスト
  （Mac 必須）。`karate-trainer/README.md` の手動チェックリストに項目追加。

## 11. 作業手順（WSL 上で実施）

1. Capacitor 依存追加（core, ios, cli, keep-awake, share, filesystem）
2. `capacitor.config.ts` 作成（appId/appName/webDir/iosScheme）
3. TDD: `parental-gate.ts` → `platform.ts` → `app.ts`/`done-screen.ts` 配線
4. `main.ts` 配線
5. `npm run build:karate`
6. `npx cap add ios`（iOS プロジェクト生成。pod install は WSL で失敗する
   想定 → §13 参照）
7. `Info.plist` に用途説明文追記
8. アイコン/スプラッシュのプレースホルダ配置（後で本番画像に差替可能に）
9. `privacy-policy.md` 作成（日英）。公開ホスティング手順を README に記載
10. `npx cap sync ios`（Mac 側）
11. vitest 全通過 + README に iOS ビルド手順・審査ノート雛形を追記

## 12. 成果物

「Mac に持っていって Xcode で `ios/App/App.xcworkspace` を開けば、そのまま
ビルド → 実機起動 → App Store 提出できる」状態の `ios/` プロジェクト一式、
共有ソースの分岐対応、保護者ゲート、プライバシーポリシー原稿、審査ノート雛形。

## 13. ユーザーの残タスク（Mac 必須 / Claude 代行不可）

- Apple Developer Program 登録（$99/年）
- Mac で `pod install`（CocoaPods）、`ios/App/App.xcworkspace` を Xcode で開く
- 署名証明書の設定（Xcode が大半を自動化）
- **プライバシーポリシーを公開 URL 化**（GitHub Pages / Notion 公開ページ等）し
  App Store Connect に登録。サポート URL も用意
- 実機での動作確認（README チェックリスト）
- 本番アイコン画像、App Store の説明文（禁止語に注意）・スクショ・年齢レーティング
  質問票（社会性機能=なし, UGC 配信=なし で 4+ を維持）・審査提出
- **審査ノート**に「動画は端末外に送信されない/ネイティブ機能を使用」と明記

## 14. リスク開示（正直に）

- **2026年4月28日以降、App Store 提出は Xcode 26 + iOS 26 SDK 必須**（Mac 側）。
  Capacitor 8 は対応済み。最低デプロイ先 iOS 15+。
- `npx cap add ios` は WSL(Linux) で**フォルダ生成自体はできる**が、
  `pod install`（CocoaPods）は WSL で失敗する。これは想定内で、`ios/` フォルダ
  を生成・コミットし、`pod install` 以降は Mac で実施する。CLI パッチ版により
  生成後の終了コード挙動が変わりうるため、**生成後に `ios/` の存在を必ず確認**する。
  失敗した場合は「設定・権限記述・分岐コードまで完成させ、`npx cap add ios` は
  Mac で1回叩く」手順書に切り替える。やってみて、ダメなら正直に報告する。
- 署名済み `.ipa` の生成は **macOS 以外では不可能**（Mac-in-the-cloud でも可）。
- 録画・カメラ・keep-awake・シェアシートの最終動作は Mac がないと検証不能。
  保証できるのは「コードとプロジェクト構成が正しく整っている」ところまで。
- 年齢レーティング質問票は 2025 改訂・2026/1/31 までに回答必須（Mac/ASC 側作業）。
- ガイドライン番号は Apple が随時変更。**提出直前に最新ガイドラインを再確認**する。

## 15. 出典（研究）

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple — App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple — Kids / age-appropriate](https://developer.apple.com/kids/) ／
  [Parental Gates](https://developer.apple.com/app-store/parental-gates/)
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)
- [16 CFR §312.2 (COPPA)](https://www.law.cornell.edu/cfr/text/16/312.2)
- [Capacitor 8 / iOS docs](https://capacitorjs.com/docs/ios) ／
  [Xcode 26 requirement](https://capawesome.io/blog/xcode-26-requirement-for-capacitor-apps/)
- [@capacitor-community/keep-awake](https://www.npmjs.com/package/@capacitor-community/keep-awake)
