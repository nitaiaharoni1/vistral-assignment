import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import type { Corners } from "../../../../types";
import { BOARD_SIZE } from "./board.constants";
import { boardCorners } from "./board-image";
import { boardTransform } from "./board-image";
import { luma } from "./board-image";
import { luminance } from "./board-image";
import { median } from "./board-image";
import { normalize } from "./board-image";
import { paperLevels } from "./board-image";
import { projectBoard } from "./board-image";
import { rectify } from "./board-image";
import { validateImage } from "./board-image";

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

describe("board-image helpers", () => {
  it("weights luma toward green", () => {
    expect(luma([10, 20, 30, 255], 0)).toBeCloseTo(10 * 0.2126 + 20 * 0.7152 + 30 * 0.0722);
  });

  it("returns the median of an odd or even list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("rejects a tiny or truncated picture", () => {
    expect(() => validateImage(grayImage(20, 20))).toThrow(/not ready/);
    const broken = grayImage(200, 200);
    (broken as { data: Uint8ClampedArray }).data = new Uint8ClampedArray(4);
    expect(() => validateImage(broken)).toThrow(/not ready/);
  });

  it("reads paper levels from the bright end of each cell", () => {
    const pixels = new Float32Array(BOARD_SIZE * BOARD_SIZE);
    pixels.fill(180);
    pixels[0] = 10;
    expect(paperLevels(pixels)[0]).toBe(180);
  });

  it("normalizes pixels against the cell paper level", () => {
    const pixels = new Float32Array(BOARD_SIZE * BOARD_SIZE);
    pixels[0] = 50;
    pixels[1] = 100;
    const paper = [100, 100, 100, 100, 100, 100, 100, 100, 100];
    const next = normalize(pixels, paper);
    expect(next[0]).toBeCloseTo(0.5);
    expect(next[1]).toBeCloseTo(0);
  });

  it("rejects corners that are out of frame, counterclockwise, or too small", () => {
    const corners: Corners = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.2, y: 0.2 },
      { x: 0.1, y: 0.2 },
    ];
    expect(() => boardTransform(corners, 320, 320)).toThrow(/Move closer/);
    expect(() =>
      boardTransform(
        [
          { x: 0.1, y: 0.1 },
          { x: 0.1, y: 0.9 },
          { x: 0.9, y: 0.9 },
          { x: 0.9, y: 0.1 },
        ],
        320,
        320,
      ),
    ).toThrow(/clockwise/);
    expect(() =>
      boardTransform(
        [
          { x: -0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ],
        320,
        320,
      ),
    ).toThrow(/inside the camera picture/);
  });

  it("builds a transform for a large upright board", () => {
    const image = grayImage(400, 400);
    const corners: Corners = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    const transform = boardTransform(corners, 400, 400);
    expect(transform).toHaveLength(9);
    const mapped = boardCorners(transform, image);
    expect(mapped[0].x).toBeCloseTo(0.1, 1);
    expect(mapped[2].y).toBeCloseTo(0.9, 1);
    const [x, y] = projectBoard(transform, 0, 0);
    expect(x).toBeCloseTo(0.1 * 399, 0);
    expect(y).toBeCloseTo(0.1 * 399, 0);
    const pixels = rectify(image, transform);
    expect(pixels).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(pixels[0]).toBeGreaterThan(100);
  });

  it("samples luminance inside the picture and not outside", () => {
    const image = grayImage(200, 200, 180);
    expect(luminance(image, 10.5, 10.5)).toBeCloseTo(180);
    expect(luminance(image, -1, 10)).toBeNaN();
    expect(luminance(image, 199, 10)).toBeNaN();
  });
});
