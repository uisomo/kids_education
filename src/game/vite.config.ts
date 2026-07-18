import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/game",
  publicDir: resolve(__dirname, "../../content"),
  // "^/api/" (regex), not "/api": a bare prefix also captures /api.ts, the
  // game's own module, and proxies it to the backend where it 404s.
  server: { proxy: { "^/api/": "http://localhost:5179" } },
});
