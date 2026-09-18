// Which app this bundle is: アランの空手 (com.alan.karate) or its spin-off
// アランのピアノ (com.alan.piano). Same code; the piano build swaps the words
// below, the pictures (public-piano/ is laid over public/ by vite.config.ts)
// and never plays BGM.
//
// Built with `npm run build:piano` (vite --mode piano → .env.piano sets
// VITE_APP_FLAVOR=piano). Everything else is the karate app.
export const IS_PIANO = import.meta.env.VITE_APP_FLAVOR === "piano";

// Written into the page only by a piano build. The Xcode build phase
// 「Check test build」 greps the bundled JS for it, so a piano bundle can never
// be archived as com.alan.karate (and a karate bundle never as the piano app).
export const PIANO_BUILD_MARKER = "ALAN_PIANO_BUILD";

export interface Copy {
  appName: string;
  practice: string;      // 稽古 / 練習 — the session itself
  belt: string;          // 帯 / リボン — the level ladder
  drillIcon: string;     // the 特訓 tab and a drill row's kind button
  againIcon: string;     // done screen 「もう一度」
  listTitle: string;     // heading of the video's menu panel when the menu has no name
}

export const COPY: Copy = IS_PIANO
  ? {
      appName: "アランのピアノ",
      practice: "練習",
      belt: "リボン",
      drillIcon: "🎹",
      againIcon: "🎹",
      listTitle: "練習メニュー",
    }
  : {
      appName: "アランの空手",
      practice: "稽古",
      belt: "帯",
      drillIcon: "🥋",
      againIcon: "🥋",
      listTitle: "特訓一覧",
    };
