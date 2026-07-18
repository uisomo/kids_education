import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  model: string;
  port: number;
  voicevoxUrl: string;
  dataDir: string;
  contentDir: string;
}

const DEFAULTS: AppConfig = {
  model: "claude-haiku-4-5",
  port: 5179,
  voicevoxUrl: "http://localhost:50021",
  dataDir: "data",
  contentDir: "content",
};

export function loadConfig(root = process.cwd()): AppConfig {
  let fileConf: Partial<AppConfig> = {};
  try {
    fileConf = JSON.parse(readFileSync(resolve(root, "config.json"), "utf8"));
  } catch {
    /* missing config.json: use defaults */
  }
  return { ...DEFAULTS, ...fileConf };
}
