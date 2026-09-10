import type { CellReading } from "../../../../types";
import type { Observation } from "../../../../types";
import type { Calibration } from "./calibration";
import { OUTER_PADDING } from "./board.constants";
import { boardCorners } from "./board-image";
import { rectify } from "./board-image";
import { paperLevels } from "./board-image";
import { normalize } from "./board-image";
import { validateImage } from "./board-image";
import { median } from "./board-image";
import { readCells } from "./cell-reader";
import { reviewSnapshots } from "./cell-reader";
import { registerFrame } from "./board-registration";

// Measures how much the board changed since the last frame.
function measureBoardMotion(pixels: Float32Array, calibration: Calibration): { motion: number; boardInk: number } {
  let changed = 0;
  let delta = 0;
  let boardInk = 0;
  for (let at = 0; at < pixels.length; at++) {
    const difference = Math.abs(pixels[at] - calibration.previous[at]);
    if (difference > 0.13) changed++;
    delta += difference;
    if (pixels[at] - calibration.baseline[at] > 0.2) boardInk++;
  }
  return {
    motion: Math.max(changed / pixels.length, delta / pixels.length),
    boardInk,
  };
}

type QualityInput = {
  reacquired: boolean;
  aligned: boolean;
  paper: number[];
  motion: number;
  ratios: number[];
  typicalRatio: number;
  boardInk: number;
  pixelCount: number;
  cells: CellReading[];
};

// Names the frame quality and a player-facing message.
export function describeQuality(input: QualityInput): { quality: Observation["quality"]; message: string } {
  if (input.reacquired || !input.aligned) {
    return {
      quality: "misaligned",
      message: "Looking for the grid again. Keep the whole board in view.",
    };
  }
  if (median(input.paper) < 75 || Math.min(...input.paper) < 50) {
    return {
      quality: "dark",
      message: "Add light so the paper and pen marks are clearly visible.",
    };
  }
  if (input.motion > 0.045) {
    return {
      quality: "moving",
      message: "Waiting for your hand and the camera to settle.",
    };
  }
  if (input.ratios.some((ratio) => ratio < input.typicalRatio * 0.76) || input.boardInk / input.pixelCount > 0.23 || input.cells.some((cell) => cell.ink > 0.33)) {
    return {
      quality: "occluded",
      message: "Move your hand away and remove strong shadows from the board.",
    };
  }
  return {
    quality: "good",
    message: input.cells.some((cell) => cell.mark === "?") ? "One square is unclear. Use a dark pen, finish the X or close the O, and keep marks inside their squares." : "Board is clear and steady.",
  };
}

// Warps the frame and measures paper, motion, and ink.
function inspectBoard(image: ImageData, calibration: Calibration) {
  const raw = rectify(image, calibration.transform);
  const paper = paperLevels(raw);
  const pixels = normalize(raw, paper);
  const ratios = paper.map((level, index) => level / Math.max(1, calibration.paper[index]));
  const { motion, boardInk } = measureBoardMotion(pixels, calibration);
  const readingPixels = normalize(rectify(image, calibration.transform, OUTER_PADDING), paper, OUTER_PADDING);
  return { paper, pixels, ratios, motion, boardInk, readingPixels };
}

// Saves the last aligned cell marks and pixels.
function rememberAlignedReading(input: { calibration: Calibration; cells: CellReading[]; pixels: Float32Array; readingPixels: Float32Array }) {
  input.calibration.cellMarks = input.cells.map((cell) => (cell.confidence >= 0.84 ? cell.mark : "?"));
  input.calibration.previous = input.pixels;
  input.calibration.readingPrevious = input.readingPixels;
}

// Reads the nine squares from a registered frame.
function readFrameCells(input: { image: ImageData; calibration: Calibration; readingPixels: Float32Array; ratios: number[]; aligned: boolean; timestamp: number }) {
  return readCells({
    pixels: input.readingPixels,
    baseline: input.calibration.baseline,
    previous: input.calibration.readingPrevious,
    paperRatios: input.ratios,
    readingGrid: input.calibration.readingGrid,
    image: input.image,
    transform: input.calibration.transform,
    previousMarks: input.calibration.cellMarks,
    snapshots: input.aligned ? input.calibration.snapshots : undefined,
    timestamp: input.timestamp,
  });
}

// Reads one calibrated camera frame into an observation.
export function analyzeFrame(input: { image: ImageData; calibration: Calibration; timestamp: number; confirmedBoard?: CellReading["mark"][] }): Observation {
  const started = performance.now();
  validateImage(input.image);
  reviewSnapshots(input.calibration.snapshots, input.timestamp);
  if (input.image.width !== input.calibration.width || input.image.height !== input.calibration.height) {
    throw new Error("The camera picture size changed. Keep this view and calibrate the empty board again.");
  }
  const { registration, reacquired } = registerFrame({
    image: input.image,
    calibration: input.calibration,
    timestamp: input.timestamp,
    confirmedBoard: input.confirmedBoard ?? [],
  });
  const { paper, pixels, ratios, motion, boardInk, readingPixels } = inspectBoard(input.image, input.calibration);
  const cells = readFrameCells({
    image: input.image,
    calibration: input.calibration,
    readingPixels,
    ratios,
    aligned: registration.aligned,
    timestamp: input.timestamp,
  });
  if (registration.aligned) rememberAlignedReading({ calibration: input.calibration, cells, pixels, readingPixels });
  return frameObservation({
    image: input.image,
    calibration: input.calibration,
    cells,
    reacquired,
    aligned: registration.aligned,
    paper,
    pixels,
    ratios,
    motion,
    boardInk,
    timestamp: input.timestamp,
    started,
  });
}

// Builds the observation returned for this frame.
function frameObservation(input: {
  image: ImageData;
  calibration: Calibration;
  cells: CellReading[];
  reacquired: boolean;
  aligned: boolean;
  paper: number[];
  pixels: Float32Array;
  ratios: number[];
  motion: number;
  boardInk: number;
  timestamp: number;
  started: number;
}): Observation {
  const { quality, message } = describeQuality({
    reacquired: input.reacquired || input.calibration.pendingGrid !== null,
    aligned: input.aligned,
    paper: input.paper,
    motion: input.motion,
    ratios: input.ratios,
    typicalRatio: median(input.ratios),
    boardInk: input.boardInk,
    pixelCount: input.pixels.length,
    cells: input.cells,
  });
  return {
    cells: input.cells,
    reacquired: input.reacquired,
    corners: boardCorners(input.calibration.transform, input.image),
    timestamp: input.timestamp,
    processingMs: performance.now() - input.started,
    motion: input.motion,
    quality,
    message,
  };
}
