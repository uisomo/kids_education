// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldShowInstallBanner, mountInstallBanner, type InstallBannerEnv } from "../../karate-trainer/src/ui/install-banner";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}

function env(over: Partial<InstallBannerEnv> = {}): InstallBannerEnv {
  return { isIosSafari: true, isStandalone: false, storage: makeStorage(), ...over };
}

describe("shouldShowInstallBanner", () => {
  it("shows on iOS Safari when not standalone and not dismissed", () => {
    expect(shouldShowInstallBanner(env())).toBe(true);
  });

  it("hides when not iOS Safari", () => {
    expect(shouldShowInstallBanner(env({ isIosSafari: false }))).toBe(false);
  });

  it("hides when already running standalone (installed)", () => {
    expect(shouldShowInstallBanner(env({ isStandalone: true }))).toBe(false);
  });

  it("hides once the user has dismissed it", () => {
    const storage = makeStorage();
    storage.setItem("karate.installBannerDismissed", "1");
    expect(shouldShowInstallBanner(env({ storage }))).toBe(false);
  });
});

describe("mountInstallBanner", () => {
  it("renders the banner into root when conditions are met", () => {
    const root = document.createElement("div");
    mountInstallBanner(root, env());
    expect(root.querySelector("[data-install-banner]")).not.toBeNull();
  });

  it("does not render when conditions are not met", () => {
    const root = document.createElement("div");
    mountInstallBanner(root, env({ isStandalone: true }));
    expect(root.querySelector("[data-install-banner]")).toBeNull();
  });

  it("dismiss button removes the banner and persists the dismissal", () => {
    const root = document.createElement("div");
    const storage = makeStorage();
    mountInstallBanner(root, env({ storage }));
    root.querySelector<HTMLButtonElement>("[data-install-banner-dismiss]")!.click();
    expect(root.querySelector("[data-install-banner]")).toBeNull();
    expect(storage.getItem("karate.installBannerDismissed")).toBe("1");
  });
});
