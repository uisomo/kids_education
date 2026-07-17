import { defineConfig } from "vite";
export default defineConfig({
  root: "src/game",
  server: { proxy: { "/api": "http://localhost:5179" } },
});
