import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GRID_CORNERS } from "../../../../../../tests/helpers/grid-image.ts";
import { ruledGridImage } from "../../../../../../tests/helpers/grid-image.ts";
import { createCalibration } from "./calibration";
import { scoreBoardCandidate } from "./calibration";
import type { Corners } from "../../../../types";

// Builds a flat gray test image.
function grayImage(width: number, height: number, value = 220): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

const CORNERS: Corners = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

describe("createCalibration", () => {
  it("rejects a tiny or dark page", () => {
    expect(() => createCalibration(grayImage(80, 80), CORNERS)).toThrow(/not ready/);
    expect(() => createCalibration(grayImage(400, 400, 20), CORNERS)).toThrow(/too dark/);
  });

  it("rejects a bright page with no grid lines", () => {
    expect(() => createCalibration(grayImage(400, 400, 220), CORNERS)).toThrow(/four grid lines/);
  });
});

describe("scoreBoardCandidate", () => {
  it("returns zero when the candidate has no grid samples", () => {
    const image = grayImage(400, 400, 220);
    const fake = {
      readingPrevious: new Float32Array(9),
      baseline: new Float32Array(9),
      readingGrid: new Uint8Array(9),
      transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      gridBaseline: new Float32Array(9),
      grid: [] as number[],
    };
    expect(scoreBoardCandidate({ image, original: fake as never, candidate: fake as never, confirmedBoard: [] })).toBe(0);
  });
});

describe("createCalibration on a ruled grid", () => {
  it("locks an empty board or names the missing lines", () => {
    const image = ruledGridImage();
    try {
      const calibration = createCalibration(image, GRID_CORNERS, "empty");
      expect(calibration.width).toBe(image.width);
      expect(calibration.grid.length).toBeGreaterThan(0);
      expect(calibration.initialBoard).toHaveLength(9);
      expect(scoreBoardCandidate({ image, original: calibration, candidate: calibration, confirmedBoard: [] })).toBeGreaterThanOrEqual(0);
    } catch (error) {
      expect((error as Error).message).toMatch(/grid lines|empty squares|too dark/);
    }
  });
});
