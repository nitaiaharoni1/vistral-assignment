import { describe, expect, it } from "vitest";
import { projectUv, quadrilateralTransform } from "./board-geometry";

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("quadrilateralTransform", () => {
  it("maps the unit square onto axis-aligned corners", () => {
    const transform = quadrilateralTransform(SQUARE);
    expect(projectUv(transform, 0, 0)).toEqual([0, 0]);
    expect(projectUv(transform, 1, 0)[0]).toBeCloseTo(100);
    expect(projectUv(transform, 1, 1)[1]).toBeCloseTo(100);
    expect(projectUv(transform, 0.5, 0.5)[0]).toBeCloseTo(50);
  });

  it("rejects corners that collapse the board", () => {
    expect(() =>
      quadrilateralTransform([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toThrow(/four corners/);
  });
});
