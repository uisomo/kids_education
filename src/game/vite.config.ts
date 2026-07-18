import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/game",
  publicDir: resolve(__dirname, "../../content"),
  server: { proxy: { "/api": "http://localhost:5179" } },
});
