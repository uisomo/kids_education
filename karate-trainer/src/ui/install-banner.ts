const DISMISS_KEY = "karate.installBannerDismissed";

export interface InstallBannerEnv {
  isIosSafari: boolean;
  isStandalone: boolean;
  storage: Storage;
}

// Show only on iPhone/iPad Safari, not already installed to the home screen,
// and not previously dismissed — data loss on iOS is a plain-Safari-tab
// problem (storage tied to the tab), not something standalone mode has.
export function shouldShowInstallBanner(env: InstallBannerEnv): boolean {
  if (!env.isIosSafari || env.isStandalone) return false;
  return env.storage.getItem(DISMISS_KEY) !== "1";
}

export function detectEnv(storage: Storage = localStorage): InstallBannerEnv {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as { standalone?: boolean }).standalone === true;
  return { isIosSafari: isIos && isSafari, isStandalone, storage };
}

export function mountInstallBanner(root: HTMLElement, env: InstallBannerEnv): void {
  if (!shouldShowInstallBanner(env)) return;

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.dataset.installBanner = "";

  const text = document.createElement("span");
  text.textContent = "保存が消えるのを防ぐには、共有ボタン→「ホーム画面に追加」してね";
  banner.append(text);

  const dismiss = document.createElement("button");
  dismiss.className = "install-banner-dismiss";
  dismiss.dataset.installBannerDismiss = "";
  dismiss.textContent = "✕";
  dismiss.setAttribute("aria-label", "閉じる");
  dismiss.addEventListener("click", () => {
    env.storage.setItem(DISMISS_KEY, "1");
    banner.remove();
  });
  banner.append(dismiss);

  root.prepend(banner);
}
