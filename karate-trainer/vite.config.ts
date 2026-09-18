import { defineConfig, type Plugin } from "vite";
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

// アランのピアノ: public-piano/ holds the piano pictures under the SAME paths as
// public/ (e.g. public-piano/characters/alan.jpg), so no code refers to them.
// In dev they are served ahead of public/; in a build they are copied over it.
function overlayPublic(dir: string): Plugin {
  const MIME: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mov": "video/quicktime",
    ".mp4": "video/mp4", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".json": "application/json",
    ".html": "text/html", ".svg": "image/svg+xml", ".webp": "image/webp",
  };
  let outDir = "";
  return {
    name: "overlay-public",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0]);
        const file = join(dir, normalize(path));
        if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() { if (existsSync(dir)) cpSync(dir, outDir, { recursive: true }); },
  };
}

export default defineConfig(({ mode }) => ({
  root: "karate-trainer",
  // strictPort so a stale instance can't silently move ports (Talk Quest convention).
  server: { port: 5273, strictPort: true, host: true }, // host:true → reachable from iPhone on LAN
  build: { outDir: "dist", emptyOutDir: true },
  plugins: mode === "piano" ? [overlayPublic(resolve(__dirname, "public-piano"))] : [],
}));
