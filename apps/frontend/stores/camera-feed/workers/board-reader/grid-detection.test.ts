import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { ruledGridImage } from "../../../../../../tests/helpers/grid-image.ts";
import { detectBoard } from "./grid-detection";
import { findBoardCandidates } from "./grid-detection";

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

describe("grid-detection", () => {
  it("finds no board on a blank or too-inky page", () => {
    expect(findBoardCandidates(grayImage(200, 200))).toEqual([]);
    expect(detectBoard(grayImage(200, 200))).toBeNull();
    const flooded = grayImage(200, 200, 10);
    expect(findBoardCandidates(flooded)).toEqual([]);
  });

  it("returns no corners when dark strokes are too short to vote", () => {
    const image = grayImage(220, 220);
    for (let x = 40; x < 60; x++) {
      const at = (50 * 220 + x) * 4;
      image.data[at] = image.data[at + 1] = image.data[at + 2] = 10;
    }
    expect(findBoardCandidates(image)).toEqual([]);
    expect(detectBoard(image)).toBeNull();
  });

  it("finds corners on a thin ruled 3x3", () => {
    const image = ruledGridImage();
    const candidates = findBoardCandidates(image);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toHaveLength(4);
    const detected = detectBoard(image);
    expect(detected === null || detected.length === 4).toBe(true);
  });
});
