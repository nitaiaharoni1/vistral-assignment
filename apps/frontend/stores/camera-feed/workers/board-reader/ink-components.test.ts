import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { closeSmallGaps } from "./ink-components";
import { components } from "./ink-components";
import { enclosedCenter } from "./ink-components";
import { hasStructuredInk } from "./ink-components";
import { hasUnsupportedInk } from "./ink-components";
import { removeGridFragments } from "./ink-components";

// Builds an ink mask from a grid of characters.
function maskFrom(rows: string[]): Uint8Array {
  const size = rows[0].length;
  const mask = new Uint8Array(size * size);
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      mask[y * size + x] = cell === "#" ? 1 : 0;
    });
  });
  return mask;
}

describe("ink-components", () => {
  it("finds blobs from largest to smallest", () => {
    const mask = new Uint8Array(16);
    mask[0] = 1;
    mask[1] = 1;
    mask[15] = 1;
    const found = components(mask, 4);
    expect(found).toHaveLength(2);
    expect(found[0].points.length).toBe(2);
    expect(found[1].points.length).toBe(1);
  });

  it("scores a hollow center as enclosed", () => {
    const size = 12;
    const mask = new Uint8Array(size * size);
    for (let y = 2; y < 10; y++) {
      for (let x = 2; x < 10; x++) {
        if (x === 2 || x === 9 || y === 2 || y === 9) mask[y * size + x] = 1;
      }
    }
    const [ring] = components(mask, size);
    expect(enclosedCenter(mask, size, ring)).toBeGreaterThan(0.2);
  });

  it("treats a large enough blob as structured ink", () => {
    const mask = new Uint8Array(20 * 20);
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) mask[y * 20 + x] = 1;
    }
    expect(hasStructuredInk(mask, 20)).toBe(true);
    expect(hasStructuredInk(new Uint8Array(20 * 20), 20)).toBe(false);
  });

  it("clears long grid-aligned fragments", () => {
    const size = 20;
    const ink = new Uint8Array(size * size);
    const grid = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      ink[y * size + 4] = 1;
      grid[y * size + 4] = 1;
    }
    const clean = removeGridFragments(ink, size, grid);
    expect(clean.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("closes a one-pixel hole in a 5x5 neighborhood", () => {
    const mask = maskFrom([".......", ".#####.", ".#...#.", ".#.#.#.", ".#...#.", ".#####.", "......."]);
    const closed = closeSmallGaps(mask, 7);
    expect(closed[3 * 7 + 3]).toBe(1);
  });

  it("notices structured ink that is not near the support mask", () => {
    const size = 20;
    const ink = new Uint8Array(size * size);
    const support = new Uint8Array(size * size);
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) ink[y * size + x] = 1;
    }
    expect(hasUnsupportedInk(ink, support, size)).toBe(true);
  });
});
