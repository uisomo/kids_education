// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { renderOverlayFrame } from "../../karate-trainer/src/overlay-frame-render";

function fakeCtx() {
  return {
    texts: [] as string[],
    font: "", textAlign: "", textBaseline: "", fillStyle: "",
    clearRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    fillText(this: { texts: string[] }, t: string) { this.texts.push(t); },
  };
}

function fakeCanvas(ctx: unknown, blob: Blob): HTMLCanvasElement {
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  } as unknown as HTMLCanvasElement;
}

it("draws drill/countdown/cue/caption text and resolves a PNG blob", async () => {
  const ctx = fakeCtx();
  const pngBlob = new Blob(["png"], { type: "image/png" });
  const canvas = fakeCanvas(ctx, pngBlob);

  const result = await renderOverlayFrame(
    { drill: "前蹴り", seconds: 12, cue: "ファイト！", caption: "腰を落とす" },
    { canvas },
  );

  expect(ctx.texts).toContain("前蹴り");
  expect(ctx.texts).toContain("12");
  expect(ctx.texts).toContain("ファイト！");
  expect(ctx.texts).toContain("腰を落とす");
  expect(result).toBe(pngBlob);
});

it("omits countdown/cue/caption text when empty", async () => {
  const ctx = fakeCtx();
  const canvas = fakeCanvas(ctx, new Blob(["png"]));

  await renderOverlayFrame({ drill: "回し蹴り", seconds: 0, cue: "", caption: "" }, { canvas });

  expect(ctx.texts).toEqual(["回し蹴り"]);
});

it("draws every revealed TEXT-mode word", async () => {
  const ctx = fakeCtx();
  const canvas = fakeCanvas(ctx, new Blob(["png"]));

  await renderOverlayFrame(
    { drill: "型", seconds: 0, cue: "", caption: "", texts: [["いち", "に"], ["さん"]] },
    { canvas },
  );

  expect(ctx.texts).toEqual(["型", "いち", "に", "さん"]);
});

it("rejects when the canvas has no 2D context", async () => {
  const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
  await expect(renderOverlayFrame({ drill: "型", seconds: 0, cue: "", caption: "" }, { canvas }))
    .rejects.toThrow();
});
