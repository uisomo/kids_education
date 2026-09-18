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
  expect(dl.textContent).toBe("⬇ 動画を保存");
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
    kufuDrills: [{ name: "前蹴り" }],
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

it("still shows the debug panel when there is no diagnostics text, with a placeholder", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
  });
  const details = root.querySelector<HTMLDetailsElement>("[data-diagnostics]")!;
  expect(details).not.toBeNull();
  expect(details.textContent).toContain("(no events logged)");
});

it("prepends the burn-in failure message to the debug panel once known", async () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    diagnosticsText: "[1.50s] track mute: video:camera1",
    burnInErrorPromise: Promise.resolve("Error: SharedArrayBuffer is not defined"),
  });
  await new Promise((r) => setTimeout(r, 0));
  const details = root.querySelector<HTMLDetailsElement>("[data-diagnostics]")!;
  expect(details.textContent).toContain("burn-in failed: Error: SharedArrayBuffer is not defined");
  expect(details.textContent).toContain("track mute: video:camera1");
});

it("does not alter the debug panel when burnInErrorPromise resolves null", async () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4",
    stats: { time: "3:00", drills: 5, cues: 14 },
    onShare: vi.fn(), onAgain: vi.fn(),
    diagnosticsText: "[1.50s] track mute: video:camera1",
    burnInErrorPromise: Promise.resolve(null),
  });
  await new Promise((r) => setTimeout(r, 0));
  const details = root.querySelector<HTMLDetailsElement>("[data-diagnostics]")!;
  expect(details.textContent).not.toContain("burn-in failed");
});

// --- 帯 result line ---
const doneBase = () => ({
  videoUrl: "blob:v", ext: "mp4", stats: { time: "00:10", drills: 1, cues: 0 },
  onShare: vi.fn(), onAgain: vi.fn(),
});

it("shows the belt meter after a finished practice", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, { ...doneBase(), beltResult: { completed: true, bars: 4, promotedTo: null } });
  expect(root.querySelector("[data-belt-result]")!.textContent).toBe("帯のバー 4/10");
});

it("celebrates moving up a belt", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, { ...doneBase(), beltResult: { completed: true, bars: 0, promotedTo: "ほのおの帯" } });
  const line = root.querySelector("[data-belt-result]")!;
  expect(line.textContent).toBe("🎉 ほのおの帯に昇級！");
  expect(line.classList.contains("promoted")).toBe(true);
});

it("says nothing was added when the practice was stopped", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, { ...doneBase(), beltResult: { completed: false, bars: 0, promotedTo: null } });
  expect(root.querySelector("[data-belt-result]")!.textContent).toContain("ふえない");
  expect(root.querySelector(".done-title")!.textContent).toBe("おつかれさま！");
});

it("an unsaved menu explains that saving it starts the belt", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, { ...doneBase(), beltResult: { completed: true, bars: 0, promotedTo: null, missed: "no-menu" } });
  expect(root.querySelector("[data-belt-result]")!.textContent).toBe("メニューを保存すると、帯と強さがたまるよ");
});

// --- 工夫 rows (each opens the 💡 card) ---
function kufuDone(notes: Record<string, string[]>) {
  return {
    videoUrl: "blob:v", ext: "mp4", stats: { time: "3:00", drills: 2, cues: 5 },
    onShare: vi.fn(), onAgain: vi.fn(),
    kufuDrills: [{ name: "前蹴り" }, { name: "回し蹴り" }],
    kufuPerDrill: 3,
    kufuFor: (name: string) => notes[name] ?? [],
    canAddKufuFor: (name: string) => (notes[name]?.length ?? 0) < 3,
    onAddKufu: vi.fn((name: string, text: string) => { notes[name] = [text, ...(notes[name] ?? [])]; }),
    onRemoveKufu: vi.fn((name: string, i: number) => { notes[name].splice(i, 1); }),
  };
}

it("shows each practiced drill's newest 工夫, or まだないよ", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, kufuDone({ 前蹴り: ["こし", "ひざ"] }));
  expect(root.querySelector('[data-kufu-latest="前蹴り"]')!.textContent).toBe("こし");
  expect(root.querySelector('[data-kufu-open="前蹴り"]')!.textContent).toBe("💡 2");
  expect(root.querySelector('[data-kufu-latest="回し蹴り"]')!.textContent).toBe("まだないよ");
});

it("💡 opens the card; adding or erasing there updates the row", () => {
  const root = document.createElement("div");
  const deps = kufuDone({ 前蹴り: ["こし"] });
  renderDoneScreen(root, deps);

  root.querySelector<HTMLButtonElement>('[data-kufu-open="回し蹴り"]')!.click();
  root.querySelector<HTMLInputElement>("[data-kufu-modal-input]")!.value = "高く";
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-save]")!.click();
  expect(deps.onAddKufu).toHaveBeenCalledWith("回し蹴り", "高く");
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(root.querySelector('[data-kufu-latest="回し蹴り"]')!.textContent).toBe("高く");

  root.querySelector<HTMLButtonElement>('[data-kufu-open="前蹴り"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-kufu-modal-remove="0"]')!.click();
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(deps.onRemoveKufu).toHaveBeenCalledWith("前蹴り", 0);
  expect(root.querySelector('[data-kufu-latest="前蹴り"]')!.textContent).toBe("まだないよ");
});

// --- LINE・SNS at the end ---
it("an allowed kid gets one 「LINE・SNSで送る」 that sends with no gate and counts as saved", () => {
  const root = document.createElement("div");
  const onSend = vi.fn();
  const onShare = vi.fn();
  const onAgain = vi.fn();
  const confirm = vi.fn().mockReturnValue(false);
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4", stats: { time: "0:10", drills: 1, cues: 0 },
    onShare, onAgain, confirm, shareAllowed: true, onSend,
  });
  const send = root.querySelector<HTMLButtonElement>("[data-share]")!;
  expect(send.textContent).toBe("LINE・SNSで送る");
  expect(root.querySelector("[data-share-note]")).toBeNull();
  // After もう一度, i.e. at the end (a dev-only debug panel may follow).
  const again = root.querySelector<HTMLButtonElement>("[data-again]")!;
  expect(again.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  send.click();
  expect(onSend).toHaveBeenCalledOnce();
  expect(onShare).not.toHaveBeenCalled();
  again.click();
  expect(confirm).not.toHaveBeenCalled();
  expect(onAgain).toHaveBeenCalledOnce();
});

it("a kid who isn't allowed sees no send button, just a note to ask", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, {
    videoUrl: "blob:v", ext: "mp4", stats: { time: "0:10", drills: 1, cues: 0 },
    onShare: vi.fn(), onAgain: vi.fn(), onSend: vi.fn(),
  });
  expect(root.querySelector("[data-share]")).toBeNull();
  expect(root.querySelector("[data-share-note]")!.textContent).toBe("LINE・SNSで送るのは、おうちの人にそうだんしてね。");
});

it("is slim: a one-row header, no avatar or stat boxes, the 工夫 list beside the video", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, kufuDone({}));
  expect(root.querySelector(".done-header .done-title")).not.toBeNull();
  expect(root.querySelector(".stat")).toBeNull();
  expect(root.querySelector("[data-companion], .toybox-avatar")).toBeNull();
  const split = root.querySelector(".done-split")!;
  expect(split.querySelector("video")).not.toBeNull();
  expect(split.querySelector("[data-kufu-section] .kufu-scroll [data-kufu-row]")).not.toBeNull();
});

it("tapping a drill name jumps the video to where that drill starts", () => {
  const root = document.createElement("div");
  renderDoneScreen(root, { ...kufuDone({}), kufuDrills: [{ name: "前蹴り", at: 0 }, { name: "回し蹴り", at: 31.5 }] });
  const video = root.querySelector("video")!;
  const play = vi.spyOn(video, "play").mockResolvedValue(undefined);
  const label = root.querySelector<HTMLButtonElement>('[data-kufu-jump="31.5"]')!;
  expect(label.textContent).toContain("▶0:31");
  label.click();
  expect(video.currentTime).toBe(31.5);
  expect(play).toHaveBeenCalled();
});

it("💡 keeps the video playing and opens the card as a sheet under it", () => {
  const root = document.createElement("div");
  document.body.append(root);
  renderDoneScreen(root, kufuDone({}));
  const video = root.querySelector("video")!;
  Object.defineProperty(video, "paused", { configurable: true, get: () => false });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  root.querySelector<HTMLButtonElement>('[data-kufu-open="前蹴り"]')!.click();
  expect(pause).not.toHaveBeenCalled();
  expect(root.querySelector("[data-kufu-modal]")!.classList.contains("is-sheet")).toBe(true);
  expect(root.classList.contains("is-writing")).toBe(true);
  root.querySelector<HTMLButtonElement>("[data-kufu-modal-close]")!.click();
  expect(root.classList.contains("is-writing")).toBe(false);
  root.remove();
});
