import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReward, getStats, statLevel } from "../../src/backend/services/progression";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tq-"));
  writeFileSync(join(dir, "characters.csv"), "child,stat,points\n");
  writeFileSync(
    join(dir, "items_progression.csv"),
    "item_category,level,image_path,required_stat_level,required_stat_type,japanese_name,emoji_fallback,description,unlock_message\n" +
    "accessory,1,/x.png,1,charisma,銀の舌のバッジ,🗣️,desc,こうしょうバッジを手に入れた！\n" +
    "accessory,2,/y.png,3,charisma,金の舌のバッジ,👑,desc,金のバッジ！\n",
  );
});

describe("progression", () => {
  it("statLevel: 50 points per level", () => {
    expect(statLevel(0)).toBe(0);
    expect(statLevel(49)).toBe(0);
    expect(statLevel(50)).toBe(1);
  });
  it("applyReward accumulates and persists", () => {
    applyReward(dir, "yuta", "charisma", 30);
    const r = applyReward(dir, "yuta", "charisma", 30);
    expect(r.points).toBe(60);
    expect(r.level).toBe(1);
    expect(getStats(dir, "yuta")).toEqual([{ child: "yuta", stat: "charisma", points: 60 }]);
  });
  it("returns unlocks only when a threshold is newly crossed", () => {
    const r1 = applyReward(dir, "yuta", "charisma", 60); // level 1 → unlock item lvl 1
    expect(r1.unlocked.map((u) => u.japanese_name)).toEqual(["銀の舌のバッジ"]);
    const r2 = applyReward(dir, "yuta", "charisma", 10); // still level 1 → nothing new
    expect(r2.unlocked).toEqual([]);
  });
  it("creates a backup before writing", () => {
    applyReward(dir, "yuta", "charisma", 10);
    const files = readFileSync(join(dir, "characters.csv"), "utf8");
    expect(files).toContain("yuta,charisma,10");
  });
});
