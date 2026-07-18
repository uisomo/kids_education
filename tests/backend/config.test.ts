import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/backend/config";

describe("loadConfig", () => {
  it("loads config.json with defaults", () => {
    const c = loadConfig();
    expect(c.model).toBe("claude-haiku-4-5");
    expect(c.port).toBe(5179);
    expect(c.voicevoxUrl).toContain("50021");
  });
});
