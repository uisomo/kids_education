export type Lang = "ja" | "en";

/**
 * The app's language: Japanese when the user's first preferred language is
 * Japanese, English otherwise. In the iOS WebView navigator.languages only
 * lists languages the app declares (CFBundleLocalizations in Info.plist), so
 * both ja and en must stay declared there or every phone reports English.
 */
export function appLang(
  nav: { languages?: readonly string[]; language?: string } | undefined =
    typeof navigator !== "undefined" ? navigator : undefined,
): Lang {
  const first = nav?.languages?.[0] ?? nav?.language ?? "ja";
  return first.toLowerCase().startsWith("ja") ? "ja" : "en";
}
