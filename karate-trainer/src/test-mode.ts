// test アプリ (bundle id com.alan.karate.test, home-screen name 「test」).
//
// Built with `npm run build:karate:test` (vite --mode test → .env.test sets
// VITE_TEST_MODE=true). In that build the App Store is never contacted — the
// plan cards switch the plan for free — and the 家族 tab gets テスト用 controls
// for the streak and each drill's level. The normal build sets it false in
// .env, so the branches that use it are dropped from the App Store bundle.
export const TEST_MODE = import.meta.env.VITE_TEST_MODE === "true";

// Written into the page only by a test build. The Xcode build phase
// 「Check test build」 greps the bundled JS for it, so a test bundle can never
// be archived as com.alan.karate (and a normal bundle never as the test app).
export const TEST_BUILD_MARKER = "KARATE_TEST_BUILD";
