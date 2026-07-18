import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ChildProfile } from "./prompt-builder";

function childDir(dataDir: string, name: string): string {
  const dir = join(dataDir, "children", name);
  mkdirSync(join(dir, "sessions"), { recursive: true });
  return dir;
}

export function getProfile(dataDir: string, name: string): ChildProfile {
  const path = join(childDir(dataDir, name), "profile.json");
  if (!existsSync(path)) {
    const fresh: ChildProfile = { name, age: null, interests: [], recentLessons: [] };
    writeFileSync(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.warn(`profile-store: failed to parse profile.json for "${name}", resetting to default`, e);
    const fresh: ChildProfile = { name, age: null, interests: [], recentLessons: [] };
    writeFileSync(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

export function saveProfile(dataDir: string, p: ChildProfile): void {
  writeFileSync(join(childDir(dataDir, p.name), "profile.json"), JSON.stringify(p, null, 2));
}

export function appendTranscript(dataDir: string, name: string, entry: object): void {
  const day = new Date().toISOString().slice(0, 10);
  const path = join(childDir(dataDir, name), "sessions", `${day}.jsonl`);
  appendFileSync(path, JSON.stringify({ ts: Date.now(), ...entry }) + "\n");
}

export function recordLessonSummary(
  dataDir: string, name: string,
  entry: { unitId: string; title: string; summary: string; date: string },
): void {
  const p = getProfile(dataDir, name);
  p.recentLessons = [entry, ...p.recentLessons].slice(0, 10);
  saveProfile(dataDir, p);
}
