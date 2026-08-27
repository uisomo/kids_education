import { defineConfig } from "vite";
export default defineConfig({
  root: "karate-trainer",
  // strictPort so a stale instance can't silently move ports (Talk Quest convention).
  server: { port: 5273, strictPort: true, host: true }, // host:true → reachable from iPhone on LAN
  build: { outDir: "dist", emptyOutDir: true },
});
