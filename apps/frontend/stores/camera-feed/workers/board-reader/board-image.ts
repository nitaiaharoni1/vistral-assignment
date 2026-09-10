import type { Corners } from "../../../../types";
import { quadrilateralTransform } from "../../../../lib/board-geometry/board-geometry";
import { projectUv } from "../../../../lib/board-geometry/board-geometry";
import { BOARD_SIZE } from "./board.constants";
import { CELL_SIZE } from "./board.constants";
import { CELL_MARGIN } from "./board.constants";

const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722];

// Returns the brightness of one pixel.
export function luma(data: ArrayLike<number>, at: number): number {
  return data[at] * LUMA_WEIGHTS[0] + data[at + 1] * LUMA_WEIGHTS[1] + data[at + 2] * LUMA_WEIGHTS[2];
}

type Point = { x: number; y: number };

// Converts normalized corners into pixel points.
function toPixelCorners(corners: Corners, width: number, height: number): Point[] {
  if (corners.length !== 4 || corners.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)) {
    throw new Error("Keep all four board corners inside the camera picture.");
  }
  return corners.map(({ x, y }) => ({
    x: x * (width - 1),
    y: y * (height - 1),
  }));
}

// Rejects corners that are not clockwise and convex.
function assertClockwiseConvex(points: Point[]) {
  const crosses = points.map((a, index) => {
    const b = points[(index + 1) % 4];
    const c = points[(index + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  if (crosses.some((cross) => cross <= 0)) {
    throw new Error("Choose corners clockwise: top left, top right, bottom right, bottom left.");
  }
}

// Rejects a board that is not upright in the picture.
function assertUprightBoard(points: Point[]) {
  const horizontal = {
    x: points[1].x + points[2].x - points[0].x - points[3].x,
    y: points[1].y + points[2].y - points[0].y - points[3].y,
  };
  const vertical = {
    x: points[2].x + points[3].x - points[0].x - points[1].x,
    y: points[2].y + points[3].y - points[0].y - points[1].y,
  };
  if (horizontal.x <= Math.abs(horizontal.y) || vertical.y <= Math.abs(vertical.x)) {
    throw new Error("Keep the board upright in the picture. Select top left first, then top right, bottom right, and bottom left.");
  }
}

// Rejects a board that is too small in the picture.
function assertBoardFillsFrame(points: Point[], width: number, height: number) {
  const area =
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % 4];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2;
  if (
    area < width * height * 0.08 ||
    points.some((point, index) => {
      const next = points[(index + 1) % 4];
      return Math.hypot(point.x - next.x, point.y - next.y) < 100;
    })
  ) {
    throw new Error("Move closer so the whole board fills more of the picture.");
  }
}

// Builds a warp from validated board corners.
export function boardTransform(corners: Corners, width: number, height: number): number[] {
  const points = toPixelCorners(corners, width, height);
  assertClockwiseConvex(points);
  assertUprightBoard(points);
  assertBoardFillsFrame(points, width, height);
  return quadrilateralTransform(points);
}

// Warps the camera picture onto a square board.
export function rectify(image: ImageData, transform: number[], padding = 0): Float32Array {
  const size = BOARD_SIZE + padding * 2;
  const output = new Float32Array(size * size);
  const [a, b, c, d, e, f, g, h] = transform;
  const { data, width, height } = image;
  for (let y = 0; y < size; y++) {
    const v = (y - padding) / (BOARD_SIZE - 1);
    for (let x = 0; x < size; x++) {
      const u = (x - padding) / (BOARD_SIZE - 1);
      const denominator = g * u + h * v + 1;
      const sourceX = Math.max(0, Math.min(width - 1.001, (a * u + b * v + c) / denominator));
      const sourceY = Math.max(0, Math.min(height - 1.001, (d * u + e * v + f) / denominator));
      const left = Math.floor(sourceX);
      const top = Math.floor(sourceY);
      const dx = sourceX - left;
      const dy = sourceY - top;
      const at = (top * width + left) * 4;
      let value = 0;
      for (let channel = 0; channel < 3; channel++) {
        const topValue = data[at + channel] * (1 - dx) + data[at + 4 + channel] * dx;
        const bottomValue = data[at + width * 4 + channel] * (1 - dx) + data[at + width * 4 + 4 + channel] * dx;
        value += (topValue * (1 - dy) + bottomValue * dy) * LUMA_WEIGHTS[channel];
      }
      output[y * size + x] = value;
    }
  }
  return output;
}

// Estimates the paper brightness of each square.
export function paperLevels(pixels: Float32Array, size = BOARD_SIZE): number[] {
  const cellSize = size / 3;
  const margin = cellSize * (CELL_MARGIN / CELL_SIZE);
  return Array.from({ length: 9 }, (_, cell) => {
    const histogram = new Uint32Array(256);
    const originX = (cell % 3) * cellSize;
    const originY = Math.floor(cell / 3) * cellSize;
    let count = 0;
    for (let y = margin; y < cellSize - margin; y += 2) {
      for (let x = margin; x < cellSize - margin; x += 2) {
        histogram[Math.round(pixels[(originY + y) * size + originX + x])]++;
        count++;
      }
    }
    let total = 0;
    for (let value = 0; value < 256; value++) {
      total += histogram[value];
      if (total >= count * 0.8) return value;
    }
    return 255;
  });
}

// Turns paper-relative darkness into ink values.
export function normalize(pixels: Float32Array, paper: number[], padding = 0): Float32Array {
  const size = BOARD_SIZE + padding * 2;
  const output = new Float32Array(pixels.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.max(0, Math.min(2, Math.floor((y - padding) / CELL_SIZE)));
      const col = Math.max(0, Math.min(2, Math.floor((x - padding) / CELL_SIZE)));
      output[y * size + x] = Math.max(0, 1 - pixels[y * size + x] / Math.max(1, paper[row * 3 + col]));
    }
  }
  return output;
}

// Maps a board point into camera pixels.
export function projectBoard(transform: number[], x: number, y: number): number[] {
  return projectUv(transform, x / (BOARD_SIZE - 1), y / (BOARD_SIZE - 1));
}

// Samples brightness at a fractional camera point.
export function luminance(image: ImageData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1) return Number.NaN;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const dx = x - left;
  const dy = y - top;
  const at = (top * image.width + left) * 4;
  // Reads luma at one pixel index.
  const value = (index: number) => luma(image.data, index);
  return (value(at) * (1 - dx) + value(at + 4) * dx) * (1 - dy) + (value(at + image.width * 4) * (1 - dx) + value(at + image.width * 4 + 4) * dx) * dy;
}

// Rejects a picture that is too small or truncated.
export function validateImage(image: ImageData): void {
  if (!image || image.width < 160 || image.height < 160 || image.data.length !== image.width * image.height * 4) {
    throw new Error("The camera picture is not ready. Wait for a clear live image and try again.");
  }
}

// Returns the median of a number list.
export function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Returns the four board corners in image space.
export function boardCorners(transform: number[], image: ImageData): Corners {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => {
    const [x, y] = projectUv(transform, u, v);
    return {
      x: x / (image.width - 1),
      y: y / (image.height - 1),
    };
  }) as Corners;
}
