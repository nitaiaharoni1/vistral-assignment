import type { CellReading } from "../../../../types";
import type { Corners } from "../../../../types";
import { projectUv } from "../../../../lib/board-geometry/board-geometry";
import { BOARD_SIZE } from "./board.constants";
import { CELL_SIZE } from "./board.constants";
import { CELL_MARGIN } from "./board.constants";
import { READING_MARGIN } from "./board.constants";
import { OUTER_PADDING } from "./board.constants";
import { WEAK_CONTRAST } from "./board.constants";
import { boardTransform } from "./board-image";
import { rectify } from "./board-image";
import { paperLevels } from "./board-image";
import { normalize } from "./board-image";
import { validateImage } from "./board-image";
import { median } from "./board-image";
import { hasStructuredInk } from "./ink-components";
import { readCells } from "./cell-reader";
import type { CellSnapshot } from "./cell-reader";
import { gridSamples } from "./grid-tracking";
import { evaluateAdjustment } from "./grid-tracking";

class NonemptyBoardError extends Error {}

export type Calibration = {
  width: number;
  height: number;
  transform: number[];
  baseline: Float32Array;
  gridBaseline: Float32Array;
  paper: number[];
  grid: number[];
  previous: Float32Array;
  readingPrevious: Float32Array;
  readingGrid: Uint8Array;
  initialBoard: CellReading["mark"][];
  cellMarks: CellReading["mark"][];
  lastAlignedAt: number | null;
  snapshots: (CellSnapshot | null)[];
  pendingGrid: {
    transform: number[];
    firstSeen: number;
    lastSeen: number;
  } | null;
  nextReacquireAt: number;
};

// Collects ink along one grid divider.
function scanDividerInk(input: { pixels: Float32Array; indices: Set<number>; vertical: boolean; divider: number }): { covered: number; examined: number } {
  let covered = 0;
  let examined = 0;
  for (let along = 10; along < BOARD_SIZE - 10; along++) {
    if (Math.abs(along - CELL_SIZE) < 12 || Math.abs(along - CELL_SIZE * 2) < 12) continue;
    let found = false;
    for (let offset = -10; offset <= 10; offset++) {
      const across = input.divider + offset;
      const at = input.vertical ? along * BOARD_SIZE + across : across * BOARD_SIZE + along;
      if (input.pixels[at] > 0.22) {
        found = true;
        input.indices.add(at);
      }
    }
    if (found) covered++;
    examined++;
  }
  return { covered, examined };
}

// Finds ink pixels on all four grid lines.
function gridReference(pixels: Float32Array): number[] {
  const indices = new Set<number>();
  for (const vertical of [true, false]) {
    for (const divider of [CELL_SIZE, CELL_SIZE * 2]) {
      const { covered, examined } = scanDividerInk({ pixels, indices, vertical, divider });
      if (covered / examined < 0.56) {
        throw new Error("I cannot see all four grid lines. Use a dark pen and place the corners around the full, empty 3×3 board.");
      }
    }
  }
  return [...indices];
}

// True when a square already has ink or a mark.
function cellHasInk(input: { raw: Float32Array; baseline: Float32Array; cell: number; size: number }): boolean {
  const originX = (input.cell % 3) * CELL_SIZE;
  const originY = Math.floor(input.cell / 3) * CELL_SIZE;
  let ink = 0;
  let samples = 0;
  const weakMask = new Uint8Array(input.size * input.size);
  for (let y = CELL_MARGIN; y < CELL_SIZE - CELL_MARGIN; y++) {
    for (let x = CELL_MARGIN; x < CELL_SIZE - CELL_MARGIN; x++) {
      const at = (originY + y) * BOARD_SIZE + originX + x;
      const nearbyPaper = median([
        input.raw[at - 8],
        input.raw[at + 8],
        input.raw[at - BOARD_SIZE * 8],
        input.raw[at + BOARD_SIZE * 8],
        input.raw[at - BOARD_SIZE * 8 - 8],
        input.raw[at - BOARD_SIZE * 8 + 8],
        input.raw[at + BOARD_SIZE * 8 - 8],
        input.raw[at + BOARD_SIZE * 8 + 8],
      ]);
      const contrast = Math.max(0, 1 - input.raw[at] / Math.max(1, nearbyPaper));
      const darkPatch = input.baseline[at] > 0.35;
      if (contrast > 0.21 || darkPatch) ink++;
      weakMask[(y - CELL_MARGIN) * input.size + x - CELL_MARGIN] = Number(contrast > WEAK_CONTRAST || darkPatch);
      samples++;
    }
  }
  return ink / samples > 0.006 || hasStructuredInk(weakMask, input.size);
}

// Rejects a board that is not empty.
function assertEmptyBoard(raw: Float32Array, baseline: Float32Array): void {
  const size = CELL_SIZE - CELL_MARGIN * 2;
  for (let cell = 0; cell < 9; cell++) {
    if (cellHasInk({ raw, baseline, cell, size })) {
      throw new NonemptyBoardError("Start with nine empty squares on a clean, evenly lit page. Remove marks, hands, and shadows, then calibrate again.");
    }
  }
}

// Clears baseline ink from the inside of each square.
function clearInteriorBaseline(baseline: Float32Array): void {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (x % CELL_SIZE >= READING_MARGIN && x % CELL_SIZE < CELL_SIZE - READING_MARGIN && y % CELL_SIZE >= READING_MARGIN && y % CELL_SIZE < CELL_SIZE - READING_MARGIN) baseline[y * BOARD_SIZE + x] = 0;
    }
  }
}

// Marks pixels that sit on supported grid ink.
function gridInkSupport(pixels: Float32Array): Uint8Array {
  const size = BOARD_SIZE + OUTER_PADDING * 2,
    stride = size + 1;
  const sums = new Uint32Array(stride * stride);
  for (let y = 0; y < size; y++) {
    let row = 0;
    for (let x = 0; x < size; x++) {
      row += Number(pixels[y * size + x] > 0.15);
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const support = new Uint8Array(pixels.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (![CELL_SIZE, CELL_SIZE * 2].some((line) => Math.abs(x - OUTER_PADDING - line) < 12 || Math.abs(y - OUTER_PADDING - line) < 12)) continue;
      const left = Math.max(0, x - 3),
        right = Math.min(size, x + 4);
      const top = Math.max(0, y - 3),
        bottom = Math.min(size, y + 4);
      support[y * size + x] = Number(sums[bottom * stride + right] - sums[top * stride + right] - sums[bottom * stride + left] + sums[top * stride + left] > 0);
    }
  return support;
}

// Reads marks already on a found board.
function existingBoard(input: { image: ImageData; transform: number[]; baseline: Float32Array; readingPrevious: Float32Array; readingGrid: Uint8Array }): CellReading["mark"][] {
  clearInteriorBaseline(input.baseline);
  return readCells({
    pixels: input.readingPrevious,
    baseline: input.baseline,
    previous: input.readingPrevious,
    paperRatios: Array(9).fill(1),
    readingGrid: input.readingGrid,
    image: input.image,
    transform: input.transform,
  }).map((cell) => (cell.readable && cell.confidence >= 0.78 ? cell.mark : "?"));
}

// Builds calibration data from board corners.
export function createCalibration(image: ImageData, corners: Corners, mode: "empty" | "existing" | "locate" = "empty"): Calibration {
  validateImage(image);
  const transform = boardTransform(corners, image.width, image.height);
  const raw = rectify(image, transform);
  const paper = paperLevels(raw);
  if (median(paper) < 105 || Math.min(...paper) < 70) {
    throw new Error("The paper is too dark. Add steady light, remove shadows, and try again.");
  }
  const baseline = normalize(raw, paper);
  const grid = gridReference(baseline);
  if (mode === "empty") assertEmptyBoard(raw, baseline);
  const previous = baseline.slice();
  const readingPrevious = normalize(rectify(image, transform, OUTER_PADDING), paper, OUTER_PADDING);
  const readingGrid = gridInkSupport(readingPrevious);
  const initialBoard = mode === "existing" ? existingBoard({ image, transform, baseline, readingPrevious, readingGrid }) : Array(9).fill(null);
  return {
    width: image.width,
    height: image.height,
    transform,
    baseline,
    gridBaseline: previous.slice(),
    paper,
    grid,
    previous,
    readingPrevious,
    readingGrid,
    initialBoard,
    cellMarks: [...initialBoard],
    lastAlignedAt: null,
    snapshots: Array.from({ length: 9 }, () => null),
    pendingGrid: null,
    nextReacquireAt: 0,
  };
}

// Scores how well a candidate matches the known grid.
export function scoreBoardCandidate(input: { image: ImageData; original: Calibration; candidate: Calibration; confirmedBoard: CellReading["mark"][] }): number {
  const cells = readCells({
    pixels: input.candidate.readingPrevious,
    baseline: input.candidate.baseline,
    previous: input.candidate.readingPrevious,
    paperRatios: Array(9).fill(1),
    readingGrid: input.candidate.readingGrid,
    image: input.image,
    transform: input.candidate.transform,
  });
  if (cells.some((cell) => cell.ink > 0.2)) return 0;
  if (input.confirmedBoard.some((mark, index) => (mark === "X" || mark === "O") && (!cells[index]?.readable || cells[index].mark !== mark || cells[index].confidence < 0.78))) return 0;
  const samples = gridSamples(input.candidate.transform, input.original.gridBaseline, input.original.grid);
  if (samples.length < 16) return 0;
  const [centerX, centerY] = projectUv(input.candidate.transform, 0.5, 0.5);
  const result = evaluateAdjustment({ image: input.image, samples, centerX, centerY, translationLimit: 0 }, { dx: 0, dy: 0, angle: 0, scale: 1 });
  return result.supported ? result.score : 0;
}
