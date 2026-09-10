import { describe, expect, it } from "vitest";
import { SNAPSHOT_LIFETIME_MS } from "./board.constants";
import { reviewSnapshots, type CellSnapshot } from "./cell-reader";

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
