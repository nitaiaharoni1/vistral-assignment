import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GRID_CORNERS } from "../../../../../../tests/helpers/grid-image.ts";
import { ruledGridImage } from "../../../../../../tests/helpers/grid-image.ts";
import { BOARD_SIZE } from "./board.constants";
import { boardTransform } from "./board-image";
import { registerFrame } from "./board-registration";
import { createCalibration } from "./calibration";
import type { Calibration } from "./calibration";

// Builds a flat gray test image.
function grayImage(width: number, height: number, value = 200): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

// Builds a calibration with no grid samples.
function emptyCalibration(): Calibration {
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
  const baseline = new Float32Array(BOARD_SIZE * BOARD_SIZE);
  return {
    width: 400,
    height: 400,
    transform,
    baseline,
    gridBaseline: baseline.slice(),
    paper: Array(9).fill(200),
    grid: [],
    previous: baseline.slice(),
    readingPrevious: baseline.slice(),
    readingGrid: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
    initialBoard: Array(9).fill(null),
    cellMarks: Array(9).fill(null),
    lastAlignedAt: null,
    snapshots: Array.from({ length: 9 }, () => null),
    pendingGrid: null,
    nextReacquireAt: 0,
  };
}

describe("registerFrame", () => {
  it("stays unaligned when the grid cannot be tracked", () => {
    const calibration = emptyCalibration();
    const { registration, reacquired } = registerFrame({
      image: grayImage(400, 400),
      calibration,
      timestamp: 10,
      confirmedBoard: Array(9).fill(null),
    });
    expect(registration.aligned).toBe(false);
    expect(registration.tracked).toBe(false);
    expect(reacquired).toBe(false);
  });

  it("tracks or reacquires a ruled grid after calibration", () => {
    const image = ruledGridImage();
    const calibration = createCalibration(image, GRID_CORNERS, "existing");
    const first = registerFrame({ image, calibration, timestamp: 20, confirmedBoard: Array(9).fill(null) });
    expect(first.registration.transform.length).toBeGreaterThanOrEqual(8);
    calibration.nextReacquireAt = 0;
    const later = registerFrame({ image, calibration, timestamp: 400, confirmedBoard: Array(9).fill(null) });
    expect(typeof later.reacquired).toBe("boolean");
    calibration.pendingGrid = {
      transform: calibration.transform.slice(),
      firstSeen: 400,
      lastSeen: 400,
    };
    calibration.nextReacquireAt = 0;
    const pending = registerFrame({ image, calibration, timestamp: 620, confirmedBoard: Array(9).fill(null) });
    expect(pending.registration.transform.length).toBeGreaterThanOrEqual(8);
  });
});
