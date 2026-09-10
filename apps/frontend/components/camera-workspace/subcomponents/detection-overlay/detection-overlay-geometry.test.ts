import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { buildOverlayGeometry } from "./detection-overlay-geometry";

describe("buildOverlayGeometry", () => {
  it("returns nine cells and four grid lines for a valid quad", () => {
    const geometry = buildOverlayGeometry([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
    expect(geometry).not.toBeNull();
    expect(geometry!.cells).toHaveLength(9);
    expect(geometry!.lines).toHaveLength(4);
    expect(geometry!.outline.split(" ")).toHaveLength(4);
    expect(geometry!.cells[4].cross).toHaveLength(2);
    expect(geometry!.cells[4].ringGuide.startsWith("M")).toBe(true);
  });

  it("returns null when the corners are unusable", () => {
    expect(buildOverlayGeometry([{ x: 0, y: 0 }])).toBeNull();
    expect(
      buildOverlayGeometry([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeNull();
  });
});
