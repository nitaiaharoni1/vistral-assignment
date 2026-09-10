import { describe, expect, it } from "vitest";
import { segmentedRing } from "./segmented-ring";

describe("segmentedRing", () => {
  it("draws eight path segments around the projected circle", () => {
    const path = segmentedRing((x, y) => [x * 10, y * 10]);
    expect(path.startsWith("M")).toBe(true);
    expect(
      path.split(" M").length + (path.includes(" M") ? 0 : 0),
    ).toBeGreaterThan(0);
    expect((path.match(/M/g) ?? []).length).toBe(8);
    expect((path.match(/L/g) ?? []).length).toBe(40);
  });
});
