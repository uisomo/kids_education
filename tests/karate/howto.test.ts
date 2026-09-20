// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HOWTO_VIDEOS, buildHowtoSection, buildParentNote } from "../../karate-trainer/src/ui/howto";

describe("使い方どうが / 保護者の方へ", () => {
  it("every how-to clip is streamed from howto-site, not bundled into the app", () => {
    expect(HOWTO_VIDEOS.map((v) => v.id)).toEqual(["menu", "kufu", "order", "delete", "member", "hook"]);
    for (const v of HOWTO_VIDEOS) {
      expect(v.src.startsWith("https://howto.karate-trainer.pages.dev/howto/")).toBe(true);
      const file = v.src.split("/").pop()!;
      expect(existsSync(join(__dirname, "../../karate-trainer/howto-site/howto", file))).toBe(true);
      expect(existsSync(join(__dirname, "../../karate-trainer/public/howto", file))).toBe(false);
    }
  });

  it("a button opens the clip in a card and とじる closes it", () => {
    const host = document.createElement("div");
    host.append(...buildHowtoSection(host));
    host.querySelector<HTMLButtonElement>('[data-howto="hook"]')!.click();
    expect(host.querySelector<HTMLVideoElement>("[data-howto-video]")!.getAttribute("src")).toBe("https://howto.karate-trainer.pages.dev/howto/howto-hook.mp4");
    // Offline → a note instead of a silent black box.
    expect(host.querySelector<HTMLElement>("[data-howto-offline]")!.hidden).toBe(true);
    host.querySelector("[data-howto-video]")!.dispatchEvent(new Event("error"));
    expect(host.querySelector<HTMLElement>("[data-howto-offline]")!.hidden).toBe(false);
    host.querySelector<HTMLButtonElement>("[data-howto-close]")!.click();
    expect(host.querySelector("[data-howto-modal]")).toBeNull();
  });

  it("the parent note says praise first, then let the kid find their own 工夫", () => {
    const text = (buildParentNote()[0] as HTMLElement).textContent ?? "";
    expect(text).toContain("LINE");
    expect(text).toContain("まずは褒めて");
    expect(text).toContain("工夫");
    expect(text).toContain("型や技ひとつ");
  });
});
