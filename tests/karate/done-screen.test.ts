// @vitest-environment jsdom
// tests/karate/done-screen.test.ts
import { it, expect, vi } from "vitest";
import { renderDoneScreen } from "../../karate-trainer/src/ui/done-screen";

it("shows stats and a save button", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:v");
  const dl = root.querySelector<HTMLButtonElement>("[data-download]")!;
  expect(dl.textContent).toContain("mp4");
});

it("save fires onShare directly with no parental gate", () => {
  const root = document.createElement("div");
  const onShare = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
  });

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  expect(onShare).toHaveBeenCalledOnce();
});

// --- 工夫 inputs ---
it("renders a 工夫 input per drill with the current value and 15-char cap", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 2, cues: 5 },
    onShare: vi.fn(), onAgain: vi.fn(),
    kufuDrills: [
      { name: "前蹴り", current: "腰を落とす" },
      { name: "回し蹴り", current: "" },
    ],
  });
  const inputs = root.querySelectorAll<HTMLInputElement>("[data-kufu-input]");
  expect(inputs).toHaveLength(2);
  expect(inputs[0].value).toBe("腰を落とす");
  expect(inputs[0].maxLength).toBe(15);
});

it("saving a 工夫 fires onSaveKufu with the drill name and text", () => {
  const root = document.createElement("div");
  const onSaveKufu = vi.fn();
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 1, cues: 5 },
    onShare: vi.fn(), onAgain: vi.fn(),
    kufuDrills: [{ name: "前蹴り", current: "" }],
    onSaveKufu,
  });
  const input = root.querySelector<HTMLInputElement>('[data-kufu-input="前蹴り"]')!;
  input.value = "軸足まっすぐ";
  root.querySelector<HTMLButtonElement>('[data-kufu-save="前蹴り"]')!.click();
  expect(onSaveKufu).toHaveBeenCalledWith("前蹴り", "軸足まっすぐ");
});

it("disables (not hides) a drill's input/save when canAdd is false (Free plan slot used elsewhere)", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 2, cues: 5 },
    onShare: vi.fn(), onAgain: vi.fn(),
    kufuDrills: [
      { name: "前蹴り", current: "腰を落とす", canAdd: true },
      { name: "回し蹴り", current: "", canAdd: false },
    ],
  });
  expect(root.querySelector<HTMLInputElement>('[data-kufu-input="前蹴り"]')!.disabled).toBe(false);
  expect(root.querySelector<HTMLInputElement>('[data-kufu-input="回し蹴り"]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>('[data-kufu-save="回し蹴り"]')!.disabled).toBe(true);
});

it("omits the 工夫 section when no drills are given", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("[data-kufu-section]")).toBeNull();
});

it("hides the 工夫 section when kufu is disabled (Free plan) even with drills", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 2, cues: 5 },
    onShare: vi.fn(), onAgain: vi.fn(),
    kufuDrills: [{ name: "前蹴り", current: "" }],
    kufuEnabled: false,
  });
  expect(root.querySelector("[data-kufu-section]")).toBeNull();
  expect(root.querySelector("[data-kufu-input]")).toBeNull();
});

// --- burn-in status swap ---
it("shows a status note while burn-in is pending, then swaps in the burned-in video", async () => {
  const root = document.createElement("div");
  let resolveBurnIn!: (b: Blob | null) => void;
  const burnInPromise = new Promise<Blob | null>((r) => { resolveBurnIn = r; });

  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:burned");

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    burnInPromise,
  });

  // Raw video is immediately playable.
  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:raw");
  expect(root.querySelector("[data-burnin-status]")).not.toBeNull();

  resolveBurnIn(new Blob(["burned"], { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:burned");
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});

it("keeps the raw video and hides the status note when burn-in resolves null", async () => {
  const root = document.createElement("div");
  const burnInPromise = Promise.resolve(null);

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    burnInPromise,
  });

  await new Promise((r) => setTimeout(r, 0));

  expect(root.querySelector("video")!.getAttribute("src")).toBe("blob:raw");
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});

it("the share button uses the burned-in blob once ready", async () => {
  const root = document.createElement("div");
  const burnedBlob = new Blob(["burned"], { type: "video/mp4" });
  const onShare = vi.fn();

  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare, onAgain: vi.fn(),
    burnInPromise: Promise.resolve(burnedBlob),
  });

  await new Promise((r) => setTimeout(r, 0));

  root.querySelector<HTMLButtonElement>("[data-download]")!.click();
  expect(onShare).toHaveBeenCalledWith(burnedBlob);
});

it("omits the status note entirely when no burnInPromise is given", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:raw", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("[data-burnin-status]")).toBeNull();
});

// --- diagnostics panel ---
it("shows a collapsed debug panel with the diagnostics text when given", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    diagnosticsText: "[1.50s] track mute: video:camera1",
  });
  const details = root.querySelector<HTMLDetailsElement>("[data-diagnostics]")!;
  expect(details).not.toBeNull();
  expect(details.open).toBe(false);
  expect(details.textContent).toContain("track mute: video:camera1");
});

it("omits the debug panel when there is no diagnostics text", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  expect(root.querySelector("[data-diagnostics]")).toBeNull();
});
