import type { CellReading, Observation } from "../../../../types";
import type { Calibration } from "./calibration";
import { OUTER_PADDING } from "./board.constants";
import {
  boardCorners,
  rectify,
  paperLevels,
  normalize,
  validateImage,
  median,
} from "./board-image";
import { readCells, reviewSnapshots } from "./cell-reader";
import { registerFrame } from "./board-registration";

function measureBoardMotion(
  pixels: Float32Array,
  calibration: Calibration,
): { motion: number; boardInk: number } {
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

export function describeQuality(
  reacquired: boolean,
  aligned: boolean,
  paper: number[],
  motion: number,
  ratios: number[],
  typicalRatio: number,
  boardInk: number,
  pixelCount: number,
  cells: CellReading[],
): { quality: Observation["quality"]; message: string } {
  if (reacquired || !aligned) {
    return {
      quality: "misaligned",
      message: "Looking for the grid again. Keep the whole board in view.",
    };
  }
  if (median(paper) < 75 || Math.min(...paper) < 50) {
    return {
      quality: "dark",
      message: "Add light so the paper and pen marks are clearly visible.",
    };
  }
  if (motion > 0.045) {
    return {
      quality: "moving",
      message: "Waiting for your hand and the camera to settle.",
    };
  }
  if (
    ratios.some((ratio) => ratio < typicalRatio * 0.76) ||
    boardInk / pixelCount > 0.23 ||
    cells.some((cell) => cell.ink > 0.33)
  ) {
    return {
      quality: "occluded",
      message: "Move your hand away and remove strong shadows from the board.",
    };
  }
  return {
    quality: "good",
    message: cells.some((cell) => cell.mark === "?")
      ? "One square is unclear. Use a dark pen, finish the X or close the O, and keep marks inside their squares."
      : "Board is clear and steady.",
  };
}

export function analyzeFrame(
  image: ImageData,
  calibration: Calibration,
  timestamp: number,
  confirmedBoard: CellReading["mark"][] = [],
): Observation {
  const started = performance.now();
  validateImage(image);
  reviewSnapshots(calibration.snapshots, timestamp);
  if (
    image.width !== calibration.width ||
    image.height !== calibration.height
  ) {
    throw new Error(
      "The camera picture size changed. Keep this view and calibrate the empty board again.",
    );
  }
  const { registration, reacquired } = registerFrame(
    image,
    calibration,
    timestamp,
    confirmedBoard,
  );
  const raw = rectify(image, calibration.transform);
  const paper = paperLevels(raw);
  const pixels = normalize(raw, paper);
  const ratios = paper.map(
    (level, index) => level / Math.max(1, calibration.paper[index]),
  );
  const { motion, boardInk } = measureBoardMotion(pixels, calibration);
  const readingPixels = normalize(
    rectify(image, calibration.transform, OUTER_PADDING),
    paper,
    OUTER_PADDING,
  );
  const cells = readCells(
    readingPixels,
    calibration.baseline,
    calibration.readingPrevious,
    ratios,
    calibration.readingGrid,
    image,
    calibration.transform,
    calibration.cellMarks,
    registration.aligned ? calibration.snapshots : undefined,
    timestamp,
  );
  if (registration.aligned) {
    calibration.cellMarks = cells.map((cell) =>
      cell.confidence >= 0.84 ? cell.mark : "?",
    );
    calibration.previous = pixels;
    calibration.readingPrevious = readingPixels;
  }
  const { quality, message } = describeQuality(
    reacquired || calibration.pendingGrid !== null,
    registration.aligned,
    paper,
    motion,
    ratios,
    median(ratios),
    boardInk,
    pixels.length,
    cells,
  );
  return {
    cells,
    reacquired,
    corners: boardCorners(calibration.transform, image),
    timestamp,
    processingMs: performance.now() - started,
    motion,
    quality,
    message,
  };
}
