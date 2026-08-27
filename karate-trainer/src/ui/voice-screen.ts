import type { CueRole } from "../cue-player";
import type { VoiceStore } from "../voice-store";

export interface VoiceScreenDeps {
  store: VoiceStore;
  makeRecorder(): { start(): Promise<void>; stop(): Promise<Blob> };
  onBack(): void;
}

export function renderVoiceScreen(root: HTMLElement, deps: VoiceScreenDeps): void {
  root.textContent = "";
  root.className = "screen voice";

  let recorder: ReturnType<typeof deps.makeRecorder> | null = null;
  let isRecording = false;

  // Role selector
  const roleSelect = document.createElement("select");
  roleSelect.dataset.role = "";
  const roles: CueRole[] = ["announce", "countdown", "encouragement"];
  roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    const label = role === "announce" ? "掛け声（始め）" : role === "countdown" ? "掛け声（数える）" : "掛け声（励まし）";
    option.textContent = label;
    roleSelect.appendChild(option);
  });
  roleSelect.value = "encouragement";

  // Label input
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = "例: もっと早く";
  labelInput.dataset.label = "";

  // Record button
  const recordBtn = document.createElement("button");
  recordBtn.dataset.record = "";
  recordBtn.className = "btn-record";
  recordBtn.textContent = "🎙 録音";

  recordBtn.addEventListener("click", async () => {
    if (!isRecording) {
      // Start recording
      recorder = deps.makeRecorder();
      await recorder.start();
      isRecording = true;
      recordBtn.textContent = "⏹ 停止";
    } else {
      // Stop recording and save
      if (recorder) {
        const blob = await recorder.stop();
        const role = roleSelect.value as CueRole;
        const label = labelInput.value || `Recording (${new Date().toLocaleTimeString()})`;
        await deps.store.add(role, label, blob);
        labelInput.value = "";
      }
      isRecording = false;
      recordBtn.textContent = "🎙 録音";
      await refresh();
    }
  });

  // Clip list
  const clipList = document.createElement("div");
  clipList.dataset.list = "";
  clipList.className = "clip-list";

  // Refresh function to rebuild the list
  const refresh = async () => {
    clipList.textContent = "";
    const clips = await deps.store.all();

    // Group by role
    const grouped: { [key in CueRole]: typeof clips } = {
      announce: [],
      countdown: [],
      encouragement: [],
    };
    clips.forEach((c) => grouped[c.role].push(c));

    // Render each role section
    roles.forEach((role) => {
      if (grouped[role].length === 0) return;

      const section = document.createElement("div");
      section.className = "clip-section";
      section.dataset.role = role;

      const heading = document.createElement("h3");
      const roleLabel = role === "announce" ? "掛け声（始め）" : role === "countdown" ? "掛け声（数える）" : "掛け声（励まし）";
      heading.textContent = roleLabel;
      section.appendChild(heading);

      const list = document.createElement("ul");
      grouped[role].forEach((clip) => {
        const item = document.createElement("li");
        item.className = "clip-item";

        const label = document.createElement("span");
        label.className = "clip-label";
        label.textContent = clip.label;

        const playBtn = document.createElement("button");
        playBtn.className = "btn-play";
        playBtn.textContent = "▶ 再生";
        playBtn.addEventListener("click", async () => {
          const audio = new Audio(clip.url);
          await audio.play();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-delete";
        deleteBtn.textContent = "🗑 削除";
        deleteBtn.addEventListener("click", async () => {
          await deps.store.remove(clip.id);
          await refresh();
        });

        item.append(label, playBtn, deleteBtn);
        list.appendChild(item);
      });
      section.appendChild(list);
      clipList.appendChild(section);
    });
  };

  // Export button
  const exportBtn = document.createElement("button");
  exportBtn.dataset.export = "";
  exportBtn.className = "btn-export";
  exportBtn.textContent = "📥 エクスポート";
  exportBtn.addEventListener("click", async () => {
    const blob = await deps.store.export();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voice-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  // Import input
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.dataset.import = "";
  importInput.accept = ".json";
  importInput.addEventListener("change", async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) {
      await deps.store.import(files[0]);
      await refresh();
      importInput.value = "";
    }
  });

  // Caveat line
  const caveat = document.createElement("div");
  caveat.className = "caveat";
  caveat.textContent = "この端末のSafariにのみ保存されます";

  // Back button
  const backBtn = document.createElement("button");
  backBtn.dataset.back = "";
  backBtn.className = "btn-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => deps.onBack());

  // Assemble
  root.append(backBtn, roleSelect, labelInput, recordBtn, clipList, exportBtn, importInput, caveat);

  // Initial refresh
  refresh();
}
