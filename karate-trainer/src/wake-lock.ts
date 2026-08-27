export class WakeGuard {
  private sentinel: WakeLockSentinel | null = null;
  constructor(private nav: Navigator = navigator) {}

  async acquire(): Promise<void> {
    const wl = (this.nav as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return;
    try { this.sentinel = await wl.request("screen"); } catch { /* denied — ignore */ }
  }

  async release(): Promise<void> {
    try { await this.sentinel?.release(); } catch { /* ignore */ }
    this.sentinel = null;
  }
}
