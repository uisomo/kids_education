import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import { cpSync, createReadStream, existsSync, rmSync, statSync } from "node:fs";
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

// 空手だけが使うファイルを ピアノのビルドから外す。public/ は丸ごと dist に
// 配られるので、このアプリが鳴らさない/映さないものまで付いてくる。
//
// **消すものは1つずつ名前で挙げること。** 拡張子でまとめて消してはいけない:
// 応援の声（characters/cheer/*.m4a・19本）と 効果音（sounds/*.m4a）は
// ピアノでも鳴るし、しかも `/characters/cheer/${id}-${n}.m4a` と実行時に
// 組み立てているので、参照を grep しても出てこない。
const KARATE_ONLY = [
  // 練習BGM。ピアノは「ピアノそのものが音楽」なので BGM を鳴らさない
  // （main.ts の bgm: IS_PIANO ? undefined）。7.95 MB ある。
  "characters/one-more-rounds.m4a",
];

function omitFromBuild(paths: string[]): Plugin {
  let outDir = "";
  return {
    name: "omit-from-build",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    // overlayPublic の closeBundle より後に回す（あちらが上書きで置き直しても
    // 消えるように）。プラグインの並び順そのまま。
    closeBundle() {
      for (const rel of paths) {
        const file = join(outDir, rel);
        if (existsSync(file)) {
          rmSync(file);
          console.log(`omit-from-build: ${rel} をピアノのビルドから外した`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: "karate-trainer",
  // strictPort so a stale instance can't silently move ports (Talk Quest convention).
  server: {
    port: 5273, strictPort: true, host: true, // host:true → reachable from iPhone on LAN
    // @alan/daily（シリーズ共通の部品）は となりの アランの基盤/ に ある。dev でも 読めるように
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(__dirname, "../../アランの基盤/packages")] },
  },
  build: { outDir: "dist", emptyOutDir: true },
  // "piano" and "piano-test" — both are the piano app, so both get its art.
  plugins: mode.startsWith("piano")
    ? [overlayPublic(resolve(__dirname, "public-piano")), omitFromBuild(KARATE_ONLY)]
    : [],
}));
