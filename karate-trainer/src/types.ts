export interface Drill {
  id: string;
  name: string;
  seconds: number;
  kind: "drill" | "rest";
  // TEXT mode: instead of the countdown number, words the kid reads out loud
  // appear one by one. Absent → "countdown" (older saved menus have neither).
  timerMode?: "countdown" | "text";
  // Raw textarea content for TEXT mode: words separated by spaces, lines by
  // newlines. Parsed (max 5 words × 3 lines) by parseDrillTexts().
  texts?: string;
}
export type Menu = Drill[];
