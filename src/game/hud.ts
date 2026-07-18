export class Hud {
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="hp-wrap"><div class="hp-bar"><div class="hp-fill"></div></div>
        <span class="enemy-name"></span></div>
      <div class="captions"></div>
      <div class="subtitle"></div>
      <div class="journal-wrap">📖 <ul class="journal"></ul></div>
      <div class="mic-state" data-state="idle">🎤</div>
      <div class="fx-layer"></div>`;
    for (const k of ["hp-fill", "captions", "subtitle", "journal", "mic-state", "fx-layer", "enemy-name"]) {
      this.el[k] = this.root.querySelector(`.${k}`) as HTMLElement;
    }
  }

  setEnemyName(n: string) { this.el["enemy-name"].textContent = n; }

  setHp(current: number, max: number): void {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    this.el["hp-fill"].style.width = `${pct}%`;
  }

  setSubtitle(text: string): void { this.el["subtitle"].textContent = text; }

  caption(who: "enemy" | "coach", text: string): void {
    const d = document.createElement("div");
    d.className = `caption caption-${who}`;
    d.textContent = `${who === "enemy" ? "👹" : "🦉"} ${text}`;
    this.el["captions"].appendChild(d);
    while (this.el["captions"].children.length > 3) this.el["captions"].firstChild!.remove();
  }

  damageNumber(n: number): void {
    const d = document.createElement("div");
    d.className = "dmg-pop";
    d.textContent = String(n);
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  journalAdd(entry: string): void {
    const li = document.createElement("li");
    li.textContent = entry;
    this.el["journal"].appendChild(li);
  }

  toast(text: string): void {
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = text;
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  celebration(text: string): void {
    const d = document.createElement("div");
    d.className = "celebration";
    d.textContent = `🎁 ${text}`;
    for (let i = 0; i < 24; i++) {
      const p = document.createElement("span");
      p.className = "confetti";
      p.style.setProperty("--dx", `${(Math.random() - 0.5) * 400}px`);
      p.style.setProperty("--delay", `${Math.random() * 0.4}s`);
      d.appendChild(p);
    }
    this.el["fx-layer"].appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  micState(s: "idle" | "listening" | "thinking"): void {
    this.el["mic-state"].dataset.state = s;
    this.el["mic-state"].textContent = s === "listening" ? "🎤…" : s === "thinking" ? "💭" : "🎤";
  }

  showRetry(onRetry: () => void): void {
    const b = document.createElement("button");
    b.className = "retry";
    b.textContent = "もういっかい！";
    b.style.pointerEvents = "auto";
    b.onclick = () => { b.remove(); onRetry(); };
    this.el["fx-layer"].appendChild(b);
  }
}
