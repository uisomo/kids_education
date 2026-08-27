// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from "vitest";
import { makeWakeGuard, shareRecording } from "../../karate-trainer/src/platform";

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:v");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

it("makeWakeGuard on web returns an object with acquire/release", async () => {
  const g = makeWakeGuard({ isNative: () => false });
  expect(typeof g.acquire).toBe("function");
  expect(typeof g.release).toBe("function");
  // web WakeGuard no-ops safely when wakeLock is unavailable in jsdom
  await expect(g.acquire()).resolves.toBeUndefined();
  await expect(g.release()).resolves.toBeUndefined();
});

it("shareRecording on web triggers an <a download> click", async () => {
  const clicks: HTMLAnchorElement[] = [];
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreate(tag) as HTMLElement;
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => { clicks.push(el as HTMLAnchorElement); };
    }
    return el as any;
  });

  await shareRecording(new Blob(["v"]), "mp4", { isNative: () => false });

  expect(clicks.length).toBe(1);
  expect(clicks[0].download).toContain("mp4");
  vi.restoreAllMocks();
});
