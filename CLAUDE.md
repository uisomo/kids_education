# IphoneApp

## 「アランの」シリーズ（アランの空手 / アランのピアノ（`karate-trainer/`））

このアプリは「アランの」シリーズの1つです。シリーズのきまりは `~/Project/アランの基盤/SERIES_GUIDE.md` にあります。

@../アランの基盤/SERIES_GUIDE.md

直す前に、SERIES_GUIDE 0章の順で「アプリで直すか・共通として直すか」を決める。
- このアプリの共通部品（ここを直すときは 0章の Q2 を考える）：`ios/App/App/KarateRecorder/`、`ios/App/App/PracticeMotionFX/AudioAnalyzer.swift`、`karate-trainer/src/` の `native-recorder.ts` `recorder.ts` `audio-sink.ts` `native-audio.ts` `parental-gate.ts` `parent-lock-store.ts` `ui/family-screen.ts` `member-store.ts` `scoped-storage.ts` `billing.ts` `revenuecat-billing.ts` `plan-store.ts` `storage-backup.ts` `platform.ts` `streak-store.ts`、`style.css` の `:root` とボタン、`public/sounds/`
- 【B】【C】【D】のときは `~/Project/アランの基盤/PENDING.md` に1行書く
- 作業の報告の最後に【A】〜【D】のどれだったかを書く
- 共通部品で「アプリだけ」か「共通」か決められないときは uk に聞く
- ルートの `src/`（Talk Quest）はシリーズの外。このきまりは `karate-trainer/` と `ios/` に使う
