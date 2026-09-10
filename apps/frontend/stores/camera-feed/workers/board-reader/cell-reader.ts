import type { CellReading } from "../../../../types";
import {
  BOARD_SIZE,
  CELL_SIZE,
  READING_MARGIN,
  OUTER_PADDING,
  WEAK_CONTRAST,
  WEAK_ADDED_CONTRAST,
  SNAPSHOT_LIFETIME_MS,
} from "./board.constants";
import { projectBoard, median } from "./board-image";
import { classifyMark } from "./mark-classifier";
import { hasUnsupportedInk } from "./ink-components";

export type CellSnapshot = {
  sample: CellSample;
  geometry: CellGeometry;
  reading: CellReading;
  capturedAt: number;
  reviewed: boolean;
};

type CellGeometry = {
  originX: number;
  originY: number;
  endX: number;
  endY: number;
  size: number;
  core: { minX: number; minY: number; maxX: number; maxY: number };
};

type CellSample = {
  mask: Uint8Array;
  weakMask: Uint8Array;
  contrast: Float32Array;
  gridMask: Uint8Array;
  changed: number;
  sampled: number;
  clippedInk: boolean;
};

function cellGeometry(cell: number): CellGeometry {
  const col = cell % 3,
    row = Math.floor(cell / 3);
  const originX = col === 0 ? -OUTER_PADDING : col * CELL_SIZE + READING_MARGIN;
  const originY = row === 0 ? -OUTER_PADDING : row * CELL_SIZE + READING_MARGIN;
  const endX =
    col === 2
      ? BOARD_SIZE + OUTER_PADDING
      : (col + 1) * CELL_SIZE - READING_MARGIN;
  const endY =
    row === 2
      ? BOARD_SIZE + OUTER_PADDING
      : (row + 1) * CELL_SIZE - READING_MARGIN;
  const size = Math.max(endX - originX, endY - originY);
  return {
    originX,
    originY,
    endX,
    endY,
    size,
    core: {
      minX: col * CELL_SIZE + READING_MARGIN - originX,
      minY: row * CELL_SIZE + READING_MARGIN - originY,
      maxX: (col + 1) * CELL_SIZE - READING_MARGIN - 1 - originX,
      maxY: (row + 1) * CELL_SIZE - READING_MARGIN - 1 - originY,
    },
  };
}

function cellCovered(
  geometry: CellGeometry,
  image: ImageData,
  transform: number[],
): boolean {
  const { core, originX, originY } = geometry;
  return [
    [core.minX, core.minY],
    [core.maxX, core.minY],
    [core.maxX, core.maxY],
    [core.minX, core.maxY],
  ].every(([x, y]) => {
    const [sx, sy] = projectBoard(transform, originX + x, originY + y);
    return isInImage(sx, sy, image);
  });
}

function isInImage(sx: number, sy: number, image: ImageData): boolean {
  return sx >= 0 && sy >= 0 && sx < image.width - 1 && sy < image.height - 1;
}

function isOnBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function inkAgainstBaseline(
  pixels: Float32Array,
  at: number,
  reference: number,
): boolean {
  return pixels[at] > 0.2 && pixels[at] - reference > 0.16;
}

function isClippedInk(sx: number, sy: number, image: ImageData): boolean {
  return Math.min(sx, sy, image.width - 1 - sx, image.height - 1 - sy) < 4;
}

function localContrast(
  pixels: Float32Array,
  at: number,
  stride: number,
): number {
  const px = at % stride,
    py = Math.floor(at / stride);
  const acrossX =
    px >= 4 && px < stride - 4
      ? Math.max(pixels[at - 4], pixels[at + 4])
      : pixels[at];
  const acrossY =
    py >= 4 && py < stride - 4
      ? Math.max(pixels[at - stride * 4], pixels[at + stride * 4])
      : pixels[at];
  return pixels[at] - Math.min(acrossX, acrossY);
}

function isWeakInk(
  pixels: Float32Array,
  at: number,
  reference: number,
  stride: number,
): boolean {
  const contrast = localContrast(pixels, at, stride);
  return (
    contrast > 0.05 &&
    pixels[at] > WEAK_CONTRAST &&
    pixels[at] - reference > WEAK_ADDED_CONTRAST
  );
}

function sampleCellPixel(
  geometry: CellGeometry,
  x: number,
  y: number,
  pixels: Float32Array,
  baseline: Float32Array,
  previous: Float32Array,
  readingGrid: Uint8Array,
  image: ImageData,
  transform: number[],
  sample: CellSample,
): void {
  const { originX, originY, endX, endY, size } = geometry;
  const boardX = originX + x;
  const boardY = originY + y;
  if (boardX >= endX || boardY >= endY) return;
  const [sx, sy] = projectBoard(transform, boardX, boardY);
  if (!isInImage(sx, sy, image)) return;
  sample.sampled++;
  const stride = BOARD_SIZE + OUTER_PADDING * 2;
  const at = (boardY + OUTER_PADDING) * stride + boardX + OUTER_PADDING;
  const reference = isOnBoard(boardX, boardY)
    ? baseline[boardY * BOARD_SIZE + boardX]
    : 0;
  const index = y * size + x;
  sample.contrast[index] = Math.min(pixels[at], pixels[at] - reference);
  sample.gridMask[index] = readingGrid[at];
  const ink = inkAgainstBaseline(pixels, at, reference);
  sample.mask[index] = Number(ink);
  if (ink && isClippedInk(sx, sy, image)) sample.clippedInk = true;
  if (ink !== inkAgainstBaseline(previous, at, reference)) sample.changed++;
  sample.weakMask[index] = Number(isWeakInk(pixels, at, reference, stride));
}

function fillCellSample(
  geometry: CellGeometry,
  pixels: Float32Array,
  baseline: Float32Array,
  previous: Float32Array,
  readingGrid: Uint8Array,
  image: ImageData,
  transform: number[],
): CellSample {
  const { size } = geometry;
  const sample: CellSample = {
    mask: new Uint8Array(size * size),
    weakMask: new Uint8Array(size * size),
    contrast: new Float32Array(size * size),
    gridMask: new Uint8Array(size * size),
    changed: 0,
    sampled: 0,
    clippedInk: false,
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sampleCellPixel(
        geometry,
        x,
        y,
        pixels,
        baseline,
        previous,
        readingGrid,
        image,
        transform,
        sample,
      );
    }
  }
  return sample;
}

function readCell(
  cell: number,
  pixels: Float32Array,
  baseline: Float32Array,
  previous: Float32Array,
  paperRatios: number[],
  readingGrid: Uint8Array,
  image: ImageData,
  transform: number[],
  previousMarks?: CellReading["mark"][],
  snapshots?: (CellSnapshot | null)[],
  timestamp = 0,
): CellReading {
  const geometry = cellGeometry(cell);
  const covered = cellCovered(geometry, image, transform);
  const sample = fillCellSample(
    geometry,
    pixels,
    baseline,
    previous,
    readingGrid,
    image,
    transform,
  );
  let reading = classifyMark(
    sample.mask,
    geometry.size,
    sample.weakMask,
    sample.gridMask,
    geometry.core,
  );
  const motion = sample.changed / Math.max(1, sample.sampled);
  const paperOk = paperRatios[cell] >= median(paperRatios) * 0.76;
  const usable = covered && !sample.clippedInk && paperOk;
  const imageReadable = usable && motion < 0.035;
  if (snapshots && imageReadable) {
    reading = readSnapshot(
      snapshots,
      cell,
      sample,
      geometry,
      reading,
      timestamp,
    );
  }
  const consistentShape =
    (reading.mark === "X" || reading.mark === "O") &&
    reading.confidence >= 0.84 &&
    previousMarks?.[cell] === reading.mark;
  return {
    ...reading,
    ink:
      (reading.ink * (geometry.size * geometry.size)) /
      Math.max(1, sample.sampled),
    imageReadable,
    readable:
      usable &&
      reading.mark !== "?" &&
      (motion < 0.035 || (consistentShape && motion < 0.08)),
  };
}

export function readCells(
  pixels: Float32Array,
  baseline: Float32Array,
  previous: Float32Array,
  paperRatios: number[],
  readingGrid: Uint8Array,
  image: ImageData,
  transform: number[],
  previousMarks?: CellReading["mark"][],
  snapshots?: (CellSnapshot | null)[],
  timestamp = 0,
): CellReading[] {
  return Array.from({ length: 9 }, (_, cell) =>
    readCell(
      cell,
      pixels,
      baseline,
      previous,
      paperRatios,
      readingGrid,
      image,
      transform,
      previousMarks,
      snapshots,
      timestamp,
    ),
  );
}

function matchingInk(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let total = 0;
  let shared = 0;
  for (let at = 0; at < a.length; at++) {
    total += a[at] + b[at];
    shared += Number(a[at] !== 0 && b[at] !== 0);
  }
  return total >= 40 && (2 * shared) / total >= 0.75;
}

function readSnapshot(
  snapshots: (CellSnapshot | null)[],
  cell: number,
  sample: CellSample,
  geometry: CellGeometry,
  reading: CellReading,
  timestamp: number,
): CellReading {
  const saved = snapshots[cell];
  if (
    reading.mark === "?" &&
    saved?.reviewed &&
    timestamp - saved.capturedAt <= SNAPSHOT_LIFETIME_MS &&
    (saved.reading.mark === "X" || saved.reading.mark === "O") &&
    matchingInk(sample.mask, saved.sample.mask) &&
    matchingInk(sample.weakMask, saved.sample.weakMask) &&
    !hasUnsupportedInk(sample.weakMask, saved.sample.weakMask, geometry.size)
  ) {
    return { ...saved.reading, ink: reading.ink };
  }
  if (reading.mark === null) snapshots[cell] = null;
  else
    snapshots[cell] = {
      sample,
      geometry,
      reading,
      capturedAt: timestamp,
      reviewed: false,
    };
  return reading;
}

export function reviewSnapshots(
  snapshots: (CellSnapshot | null)[],
  timestamp: number,
): void {
  snapshots.forEach((snapshot, cell) => {
    if (!snapshot) return;
    if (timestamp - snapshot.capturedAt > SNAPSHOT_LIFETIME_MS) {
      snapshots[cell] = null;
      return;
    }
    if (snapshot.reviewed) return;
    snapshot.reviewed = true;
    if (snapshot.reading.mark !== "?") return;
    const { sample, geometry } = snapshot;
    const readings = [WEAK_CONTRAST, 0.1, 0.14, 0.18].map((threshold) =>
      classifyMark(
        Uint8Array.from(sample.contrast, (value) => Number(value > threshold)),
        geometry.size,
        sample.weakMask,
        sample.gridMask,
        geometry.core,
      ),
    );
    const marks = readings.filter(
      (reading) => reading.mark === "X" || reading.mark === "O",
    );
    if (
      marks.length >= 2 &&
      marks.every((reading) => reading.mark === marks[0].mark)
    )
      snapshot.reading = {
        ...marks[0],
        confidence: Math.min(
          0.86,
          ...marks.map((reading) => reading.confidence),
        ),
      };
  });
}
