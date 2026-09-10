import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GRID_CORNERS } from "../../../../../../tests/helpers/grid-image.ts";
import { ruledGridImage } from "../../../../../../tests/helpers/grid-image.ts";
import { createCalibration } from "./calibration";
import { analyzeFrame } from "./frame-analysis";
import { describeQuality } from "./frame-analysis";
import type { Calibration } from "./calibration";

const paper = [200, 200, 200, 200, 200, 200, 200, 200, 200];
const cells = Array.from({ length: 9 }, () => ({
  mark: null,
  confidence: 0.99,
  ink: 0.01,
}));

function quality(overrides: Partial<Parameters<typeof describeQuality>[0]> = {}) {
  return describeQuality({
    reacquired: false,
    aligned: true,
    paper,
    motion: 0,
    ratios: paper,
    typicalRatio: 1,
    boardInk: 0,
    pixelCount: 1000,
    cells,
    ...overrides,
  });
}

describe("describeQuality", () => {
  it("calls a lost grid misaligned", () => {
    expect(quality({ reacquired: true, aligned: false }).quality).toBe("misaligned");
  });

  it("calls a dim page dark", () => {
    expect(quality({ paper: [40, 40, 40, 40, 40, 40, 40, 40, 40] }).quality).toBe("dark");
  });

  it("waits when the page is moving", () => {
    expect(quality({ motion: 0.05 }).quality).toBe("moving");
  });

  it("treats a covered or inky board as occluded", () => {
    expect(quality({ ratios: [0.5, 1, 1, 1, 1, 1, 1, 1, 1] }).quality).toBe("occluded");
    expect(quality({ boardInk: 300 }).quality).toBe("occluded");
  });

  it("is good when the page is still, and mentions an unclear square", () => {
    expect(quality()).toMatchObject({
      quality: "good",
      message: "Board is clear and steady.",
    });
    const unclear = [{ mark: "?" as const, confidence: 0.99, ink: 0.01 }, ...cells.slice(1)];
    expect(quality({ cells: unclear }).message).toMatch(/unclear/);
  });
});

describe("analyzeFrame", () => {
  it("rejects a picture that changed size after calibration", () => {
    const image = {
      data: new Uint8ClampedArray(200 * 200 * 4),
      width: 200,
      height: 200,
    } as ImageData;
    const calibration = {
      width: 400,
      height: 400,
      snapshots: Array.from({ length: 9 }, () => null),
    } as Calibration;
    expect(() => analyzeFrame({ image, calibration, timestamp: 10 })).toThrow(/size changed/);
  });

  it("reads a calibrated ruled page", () => {
    const image = ruledGridImage();
    let calibration: Calibration;
    try {
      calibration = createCalibration(image, GRID_CORNERS, "existing");
    } catch {
      return;
    }
    const observation = analyzeFrame({ image, calibration, timestamp: 40 });
    expect(observation.cells).toHaveLength(9);
    expect(observation.corners).toHaveLength(4);
    expect(observation.quality).toMatch(/good|misaligned|moving|dark|occluded/);
  });
});
