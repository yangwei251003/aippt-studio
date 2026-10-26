import { describe, expect, it } from "vitest";
import { GOLDEN_SET_V2 } from "../src/index.js";

describe("AIPPT V2 golden set", () => {
  it("covers sixty fixed tasks across twelve categories and required delivery variants", () => {
    expect(GOLDEN_SET_V2).toHaveLength(60);
    expect(new Set(GOLDEN_SET_V2.map(({ category }) => category)).size).toBe(12);
    expect(new Set(GOLDEN_SET_V2.map(({ language }) => language)).size).toBe(2);
    expect(new Set(GOLDEN_SET_V2.map(({ pageCount }) => pageCount))).toEqual(new Set([5, 10, 20]));
    expect(new Set(GOLDEN_SET_V2.map(({ delivery }) => delivery))).toEqual(new Set(["live", "read"]));
    expect(new Set(GOLDEN_SET_V2.map(({ sources }) => sources))).toEqual(new Set(["none", "provided"]));
    expect(new Set(GOLDEN_SET_V2.map(({ contentWeight }) => contentWeight))).toEqual(new Set(["balanced", "data-heavy", "image-heavy"]));
  });
});
