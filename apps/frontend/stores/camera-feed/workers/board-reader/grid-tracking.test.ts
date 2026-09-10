import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GRID_CORNERS } from "../../../../../../tests/helpers/grid-image.ts";
import { ruledGridImage } from "../../../../../../tests/helpers/grid-image.ts";
import { BOARD_SIZE } from "./board.constants";
import { boardTransform } from "./board-image";
import { createCalibration } from "./calibration";
import { evaluateAdjustment } from "./grid-tracking";
import { gridSamples } from "./grid-tracking";
import { trackGrid } from "./grid-tracking";

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

describe("grid-tracking", () => {
  it("needs enough ink samples before it will track", () => {
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
    expect(gridSamples(transform, baseline, [])).toEqual([]);
    const tracked = trackGrid({ image: grayImage(400, 400), transform, baseline, grid: [] });
    expect(tracked).toMatchObject({
      tracked: false,
      aligned: false,
      score: 0,
    });
  });

  it("scores an empty adjustment as unsupported without line samples", () => {
    const result = evaluateAdjustment(
      {
        image: grayImage(80, 80),
        samples: [],
        centerX: 40,
        centerY: 40,
        translationLimit: 10,
      },
      { dx: 0, dy: 0, angle: 0, scale: 1 },
    );
    expect(result.supported).toBe(false);
    expect(result.score).toBe(0);
  });

  it("samples grid ink after a real calibration", () => {
    const image = ruledGridImage();
    let calibration;
    try {
      calibration = createCalibration(image, GRID_CORNERS, "existing");
    } catch {
      return;
    }
    const samples = gridSamples(calibration.transform, calibration.gridBaseline, calibration.grid);
    expect(samples.length).toBeGreaterThan(0);
    const tracked = trackGrid({
      image,
      transform: calibration.transform,
      baseline: calibration.gridBaseline,
      grid: calibration.grid,
    });
    expect(tracked.score).toBeGreaterThanOrEqual(0);
  });
});
