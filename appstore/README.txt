【App Store 用のファイル（アプリごと）】

リポジトリの appstore/ にまとめている（メモは記号なしのテキスト）（以前は Desktop にあった）。
テキスト（listing・メモ・slides.json）は git に入り、大きな画像（スクリーンショット・審査用・元画面）は
.gitignore で除外してあるので、このフォルダごとバックアップすること。

karate/ と piano/ は同じ形にそろえてある。

appstore/
├── README.txt                 この説明
├── promotion-plan.txt         宣伝プラン（両方のアプリ）
├── karate/                   アランの空手（公開中）
│   ├── listing.txt            サブタイトル・概要・キーワード・プロモーション用テキスト（最新 v2）
│   ├── app-info.txt           アプリ情報・年齢制限・プライバシー
│   ├── submission-notes.txt   審査メモ（DATA & KIDS CATEGORY）・過去に指摘されたこと・TODO
│   ├── review/               審査用スクリーンショット（サブスクリプション）
│   └── screenshots/
│       ├── 6.9inch/          ← App Store Connect に上げるもの（1320×2868）
│       ├── 6.5inch/          ← 同じく（1284×2778）
│       ├── source/           元になったアプリの画面
│       ├── slides.json       見出しの文言 → 作り直し用
│       └── old-v1/           前の版
└── piano/                    アランのピアノ（初回 1.0 提出準備中）
    ├── listing.txt            サブタイトル・概要・キーワード・プロモーション用テキスト
    ├── app-info.txt           アプリ情報・年齢制限・プライバシー
    ├── submission-notes.txt   審査メモ・過去の指摘への対策・TODO
    ├── review/               審査用スクリーンショット（subscriptions-review-1320x2868.jpg）
    └── screenshots/          6.9inch / 6.5inch / source / slides.json（空手と同じ）

【作り直すとき（リポジトリのフォルダで）】
- スクリーンショット
  - 空手：swift karate-trainer/tools/make-store-screenshots.swift appstore/karate/screenshots/slides.json
  - ピアノ：swift karate-trainer/tools/make-store-screenshots.swift appstore/piano/screenshots/slides.json
- 審査用スクリーンショット：iPhone 17 Pro Max のシミュレーターで、画面全体（1320×2868）を撮る。切り取らない。透過なしの JPEG にする。

【公開ページ（プライバシー・サポート）】
- 空手：karate-trainer/public/privacy.html と support.html → https://karate-trainer.pages.dev/privacy ・ /support（Cloudflare Pages karate-trainer）
- ピアノ：karate-trainer/piano-site/privacy.html と support.html → https://alan-piano.pages.dev/privacy ・ /support（Cloudflare Pages alan-piano）
  - 公開：npx wrangler pages deploy karate-trainer/piano-site --project-name=alan-piano --branch=main（初回だけ npx wrangler pages project create alan-piano --production-branch=main --force。新しい wrangler は --force なしだと Workers 側に回って失敗する。2026-09-22 公開ずみ）。外部に出る操作なので、実行前にユーザーに確認する。
- アプリ内のリンクは karate-trainer/src/billing.ts の PRIVACY_URL（ピアノビルドのときだけピアノのURL）。
