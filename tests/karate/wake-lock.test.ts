import { describe, it, expect, vi } from "vitest";
import { WakeGuard } from "../../src/wake-lock";

it("acquires and releases a wake lock when supported", async () => {
  const sentinel = { release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockResolvedValue(sentinel);
  const nav = { wakeLock: { request } } as unknown as Navigator;
  const g = new WakeGuard(nav);
  await g.acquire();
  expect(request).toHaveBeenCalledWith("screen");
  await g.release();
  expect(sentinel.release).toHaveBeenCalledOnce();
});

it("no-ops when wakeLock is unavailable", async () => {
  const g = new WakeGuard({} as Navigator);
  await expect(g.acquire()).resolves.toBeUndefined();
  await expect(g.release()).resolves.toBeUndefined();
});
