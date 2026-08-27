# 空手稽古 (Karate Trainer)

A standalone, portrait-only browser app for running a solo karate practice
session on an iPhone: it films you (front camera, mirrored preview) through a
timed drill menu, plays cues (beeps/TTS, or your own recorded voice clips),
keeps the screen awake, and produces a downloadable `.mp4`/`.webm` recap at
the end.

This app lives entirely under `karate-trainer/` and is independent from the
rest of the repo (Talk Quest). It has no server component — everything runs
client-side in the browser.

## Running it

1. From the repo root, start the dev server:

   ```bash
   npm run dev:karate
   ```

   This runs Vite against `karate-trainer/vite.config.ts`, which binds with
   `host: true` on port `5273` so it's reachable from other devices on your
   LAN (not just `localhost`).

2. Find your Mac's LAN IP (e.g. via System Settings → Wi-Fi → Details, or
   `ipconfig getifaddr en0` in Terminal).

3. On your iPhone, connect to the **same Wi-Fi network**, open Safari, and
   go to:

   ```
   http://<your-mac-LAN-ip>:5273
   ```

4. Safari will prompt for camera and microphone permission — grant both.
   The app needs the camera to record your session and the microphone both
   for recording the session's audio track and for the optional in-app
   voice-clip recorder (Setup → 声を録音).

To build a static production bundle instead:

```bash
npm run build:karate
```

Output goes to `karate-trainer/dist/`.

## iOS autoplay caveat

On the training screen, the camera preview's `<video>` element calls
`.play()` only *after* `await startCamera()` resolves (see `src/app.ts`,
`beginTraining()`). Because that `await` sits between the user's tap (on
「稽古 開始」) and the `.play()` call, some iOS Safari versions may treat the
gesture as "expired" by the time playback is requested and decline to
autoplay the preview. If you see a black/frozen preview on-device even
though the permission prompt was granted, this is the known gesture-timing
caveat — it's worth explicitly testing on a real iPhone (not just desktop
Safari or the simulator) as part of the checklist below.

## Manual test checklist

Run through this on an actual iPhone (Safari), not just a desktop browser —
camera/mic permissions, autoplay, and safe-area insets only behave
realistically on-device.

- [ ] Camera permission prompt appears on starting a session; the preview is
      mirrored (like a mirror, not like a security camera).
- [ ] **Denying** camera permission returns you to the setup screen with a
      visible error message (`カメラを開始できませんでした。権限を確認してください`) —
      not a stuck or blank screen.
- [ ] Timer counts down per drill; the drill name and progress
      (`n / total 種目`) are correct at each step.
- [ ] Cues play:
  - [ ] With no voice clips recorded, cues fall back to beep/TTS.
  - [ ] After recording your own clips (see below), your clips play instead.
- [ ] Encouragement cues fire during the middle of a drill, but **not**
      during rest drills and **not** in the final 3 seconds of a drill.
- [ ] Auto-advance moves to the next drill without manual input; the
      REC elapsed counter (`REC mm:ss`) keeps increasing throughout.
- [ ] The screen stays awake for the whole session (no auto-lock/dimming).
- [ ] Tapping 終了 (or reaching the end of the menu) stops the session and
      shows the Done screen with a working video preview.
- [ ] `動画を保存` opens the parental gate (an addition problem); after
      solving it, the recording is shared via the OS share sheet on iOS
      (or downloaded as `.mp4`/`.webm` in a desktop browser).
- [ ] Recording a voice clip (Setup → 声を録音 → 🎙 録音):
  - [ ] The clip plays back during the *next* training session as a cue.
  - [ ] The clip survives a full page reload (stored in IndexedDB, not
        memory).
- [ ] Export (📥 エクスポート) downloads a backup JSON; after clearing
      Safari's site data, Import (file picker) restores the exported clips.
- [ ] Menu edits (drill name/seconds, add/remove rows) persist across a
      page reload.

## iOS ネイティブアプリ (Capacitor)

このアプリは Capacitor で iOS ネイティブアプリ化できます。設計の詳細は
`docs/superpowers/specs/2026-08-27-karate-trainer-ios-design.md` を参照。

### ビルド手順

WSL 側（Mac 不要):
1. `npm run build:karate` — web 資産を `dist/` に生成
2. `npx cap add ios` — iOS プロジェクトを生成（WSL では末尾の pod install が
   失敗しうるが想定内。`ios/App/App/Info.plist` ができていれば OK）

> **注意:** `npx cap add ios`（iOS プロジェクト生成）には **Node.js 22 以上** が
> 必要です。この開発環境（Node 20）では実行できなかったため、`ios/` プロジェクトは
> まだ生成されていません。**Mac 側（Node 22+ / Xcode）で `npx cap add ios` を1回
> 実行して生成してください。** 生成後、`ios/App/App/Info.plist` に以下のカメラ／
> マイク権限文を追記します（下記「Info.plist 権限文」参照）。

Mac 側（必須):
3. `npm run cap:sync` — `dist` を iOS へ同期し `pod install` 実行
4. `npm run cap:open` — Xcode で `ios/App/App.xcworkspace` を開く
5. 署名（Apple Developer 登録が必要, $99/年）→ 実機ビルド → App Store 提出
   - **Xcode 26 + iOS 26 SDK 必須**（2026/4/28 以降の提出要件）

#### Info.plist 権限文

`npx cap add ios` 実行後、Mac 上で `ios/App/App/Info.plist` に以下を追記してください
（カメラ・マイクの利用目的を端末内保存に限定する旨を明記）:

```xml
<key>NSCameraUsageDescription</key>
<string>稽古の様子を録画するためにカメラを使用します。動画はこの端末内にのみ保存されます。</string>
<key>NSMicrophoneUsageDescription</key>
<string>稽古の音声とかけ声を録音するためにマイクを使用します。音声はこの端末内にのみ保存されます。</string>
```

（`NSPhotoLibraryAddUsageDescription` は不要です。共有は OS の共有シート経由で
行われ、フォトライブラリへの書き込み権限を必要としないため。）

### App Store 提出前チェック（審査で落ちないために）

- [ ] プライバシーポリシー (`privacy-policy.md`) の連絡先メールを埋め、
      GitHub Pages 等で**公開 URL** にして App Store Connect に登録
      （`privacy-policy.md` 内の `<入力してください: 連絡先メールアドレス>` /
      `<FILL IN: contact email>` は未入力のプレースホルダのままです。公開前に
      必ず実際の連絡先メールアドレスに置き換えてください）
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
