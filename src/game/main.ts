import { ScreenRouter } from "./screens";
import { listLessons } from "./api";

const SUBJECTS: { id: string; label: string; enabled: boolean }[] = [
  { id: "negotiation", label: "こうしょう", enabled: true },
  { id: "social", label: "ソーシャル", enabled: false },
  { id: "english", label: "えいご", enabled: false },
  { id: "psychology", label: "こころ", enabled: false },
  { id: "persuasion", label: "せっとく", enabled: false },
  { id: "lifehack", label: "ライフハック", enabled: false },
  { id: "philosophy", label: "てつがく", enabled: false },
  { id: "morals", label: "モラル", enabled: false },
  { id: "friendship", label: "ゆうじょう", enabled: false },
  { id: "teamwork", label: "チームワーク", enabled: false },
  { id: "money", label: "おかね", enabled: false },
  { id: "stocks", label: "かぶ", enabled: false },
];

export const router = new ScreenRouter();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export function getChild(): { name: string; avatar: string } | null {
  const raw = localStorage.getItem("tq-child");
  return raw ? JSON.parse(raw) : null;
}

function initSetup() {
  const saved = getChild();
  if (saved) ($("#child-name") as HTMLInputElement).value = saved.name;
  const picker = $("#avatar-picker");
  ["🦊", "🐰", "🐯", "🐸"].forEach((emoji, i) => {
    const slot = document.createElement("div");
    slot.className = "avatar-slot" + (i === 0 ? " selected" : "");
    slot.textContent = emoji;
    slot.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:3rem";
    slot.onclick = () => {
      picker.querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
      slot.classList.add("selected");
    };
    picker.appendChild(slot);
  });
  $("#btn-start").onclick = () => {
    const name = ($("#child-name") as HTMLInputElement).value.trim();
    if (!name) return;
    const avatar = picker.querySelector(".selected")?.textContent ?? "🦊";
    localStorage.setItem("tq-child", JSON.stringify({ name, avatar }));
    router.show("subjects");
  };
}

function initSubjects() {
  const grid = $("#subject-grid");
  for (const s of SUBJECTS) {
    const b = document.createElement("button");
    b.textContent = s.label;
    b.disabled = !s.enabled;
    b.onclick = async () => {
      const units = await listLessons(s.id);
      const list = $("#unit-list");
      list.innerHTML = "";
      for (const u of units) {
        const ub = document.createElement("button");
        ub.textContent = u.title;
        ub.onclick = () => {
          // Arena launch is wired in Task 15 (session controller).
          document.dispatchEvent(new CustomEvent("tq-launch", { detail: { subject: s.id, unitId: u.id } }));
        };
        list.appendChild(ub);
      }
      router.show("units");
    };
    grid.appendChild(b);
  }
  $("#btn-back-subjects").onclick = () => router.show("subjects");
}

initSetup();
initSubjects();

document.addEventListener("tq-launch", async (e) => {
  const { subject, unitId } = (e as CustomEvent).detail;
  const child = getChild();
  if (!child) { router.show("setup"); return; }
  router.show("arena");
  const [{ Arena }, { Hud }, { AudioMan }, { SessionController }, { makeRecognizer }, api] =
    await Promise.all([
      import("./arena"), import("./hud"), import("./audio"),
      import("./session"), import("./speech"), import("./api"),
    ]);
  const arena = new Arena(document.getElementById("arena-canvas") as HTMLCanvasElement);
  const hud = new Hud(document.getElementById("hud")!);
  const audio = new AudioMan();
  const controller = new SessionController({
    arena, hud, audio, api, child,
    makeRec: (ev) => makeRecognizer(ev),
    onExit: () => { arena.dispose(); router.show("subjects"); },
  });
  try {
    await controller.start(subject, unitId);
  } catch {
    hud.toast("マイクのじゅんびができなかったよ。せっていをみてね");
  }
});
