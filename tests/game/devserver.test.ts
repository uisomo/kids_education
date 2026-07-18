import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import type { AddressInfo } from "node:net";

// The /api proxy must not swallow the game's own modules: /api.ts is a static
// import of main.ts, and if it 404s the whole module graph dies and no click
// handlers get attached (the "ぼうけんにでる！ button does nothing" bug).
describe("game dev server", () => {
  let server: ViteDevServer;
  let base: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: "src/game/vite.config.ts",
      server: { port: 0 },
      logLevel: "silent",
    });
    await server.listen();
    const addr = server.httpServer!.address() as AddressInfo;
    base = `http://localhost:${addr.port}`;
  });

  afterAll(async () => {
    await server?.close();
  });

  it.each(["/main.ts", "/screens.ts", "/api.ts"])(
    "serves %s as a JS module (not proxied to the backend)",
    async (path) => {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("javascript");
    },
    // first-request transforms can be slow on /mnt/c under load
    15_000,
  );
});
