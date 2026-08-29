import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/game",
  publicDir: resolve(__dirname, "../../content"),
  // "^/api/" (regex), not "/api": a bare prefix also captures /api.ts, the
  // game's own module, and proxies it to the backend where it 404s.
  // strictPort: if 5173 is taken, fail loudly instead of silently moving to
  // 5174 — a moved port is how a stale instance keeps serving old code at :5173.
  server: { port: 5173, strictPort: true, proxy: { "^/api/": "http://localhost:5179" } },
});
