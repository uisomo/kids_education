import { describe, it, expect, beforeEach } from "vitest";
import {
  type Decor, DECORS, DECOR_META,
  canRemoveDecor, effectiveDecor, loadDecor, setDecor,
} from "../../karate-trainer/src/decor-store";

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

let base: Storage;
beforeEach(() => { base = storage(); });

it("starts on the frame", () => {
  expect(loadDecor(base)).toBe("frame");
});

it("keeps the choice the parent made", () => {
  setDecor("banner", base);
  expect(loadDecor(base)).toBe("banner");
});

it("falls back to the frame when the stored value is junk", () => {
  base.setItem("karate.videoDecor", "sparkles");
  expect(loadDecor(base)).toBe("frame");
});

it("has a label and a hint for every option", () => {
  expect(DECORS).toEqual(["frame", "icon", "banner", "none"]);
  for (const decor of DECORS) {
    expect(DECOR_META[decor].label.length).toBeGreaterThan(0);
    expect(DECOR_META[decor].hint.length).toBeGreaterThan(0);
  }
});

describe("「なし」 is the paid option", () => {
  it("only a paid plan may turn the decoration off", () => {
    expect(canRemoveDecor("free")).toBe(false);
    expect(canRemoveDecor("premium")).toBe(true);
    expect(canRemoveDecor("family")).toBe(true);
  });

  it("a free household's video still gets a decoration", () => {
    setDecor("none", base);
    expect(effectiveDecor("free", base)).toBe("frame");
  });

  it("keeps 「なし」 stored through a downgrade, so upgrading restores it", () => {
    setDecor("none", base);
    expect(effectiveDecor("free", base)).toBe("frame");
    expect(loadDecor(base)).toBe("none");
    expect(effectiveDecor("premium", base)).toBe("none");
  });

  it("passes the other choices through on any plan", () => {
    for (const decor of ["frame", "icon", "banner"] as Decor[]) {
      setDecor(decor, base);
      expect(effectiveDecor("free", base)).toBe(decor);
      expect(effectiveDecor("family", base)).toBe(decor);
    }
  });
});
