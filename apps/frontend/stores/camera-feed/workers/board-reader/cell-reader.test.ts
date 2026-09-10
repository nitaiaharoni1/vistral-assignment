import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { BOARD_SIZE } from "./board.constants";
import { OUTER_PADDING } from "./board.constants";
import { SNAPSHOT_LIFETIME_MS } from "./board.constants";
import { boardTransform } from "./board-image";
import { readCells } from "./cell-reader";
import { reviewSnapshots } from "./cell-reader";
import type { CellSnapshot } from "./cell-reader";

// Builds a cell snapshot for review tests.
function snapshot(overrides: Partial<CellSnapshot> = {}): CellSnapshot {
  return {
    sample: {
      mask: new Uint8Array(16),
      weakMask: new Uint8Array(16),
      contrast: new Float32Array(16),
      gridMask: new Uint8Array(16),
      changed: 0,
      sampled: 16,
      clippedInk: false,
    },
    geometry: {
      originX: 0,
      originY: 0,
      endX: 4,
      endY: 4,
      size: 4,
      core: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
    },
    reading: { mark: "X", confidence: 0.9, ink: 0.1 },
    capturedAt: 0,
    reviewed: false,
    ...overrides,
  };
}

describe("reviewSnapshots", () => {
  it("drops a snapshot after its lifetime", () => {
    const snapshots: (CellSnapshot | null)[] = [snapshot()];
    reviewSnapshots(snapshots, SNAPSHOT_LIFETIME_MS + 1);
    expect(snapshots[0]).toBeNull();
  });

  it("marks a fresh X as reviewed without changing it", () => {
    const current = snapshot();
    const snapshots: (CellSnapshot | null)[] = [current];
    reviewSnapshots(snapshots, 100);
    expect(snapshots[0]?.reviewed).toBe(true);
    expect(snapshots[0]?.reading.mark).toBe("X");
  });

  it("leaves an already reviewed snapshot alone", () => {
    const current = snapshot({
      reviewed: true,
      reading: { mark: "?", confidence: 0.2, ink: 0.1 },
    });
    const snapshots: (CellSnapshot | null)[] = [current];
    reviewSnapshots(snapshots, 100);
    expect(snapshots[0]?.reading.mark).toBe("?");
  });
});

describe("readCells", () => {
  it("reads nine empty squares from a flat board", () => {
    const size = BOARD_SIZE + OUTER_PADDING * 2;
    const pixels = new Float32Array(size * size);
    const image = {
      data: new Uint8ClampedArray(400 * 400 * 4).fill(220),
      width: 400,
      height: 400,
    } as ImageData;
    const transform = boardTransform(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      400,
      400,
    );
    const cells = readCells({
      pixels,
      baseline: pixels,
      previous: pixels,
      paperRatios: Array(9).fill(1),
      readingGrid: new Uint8Array(size * size),
      image,
      transform,
    });
    expect(cells).toHaveLength(9);
    expect(cells.every((cell) => cell.mark === null || cell.mark === "?")).toBe(true);
  });
});
