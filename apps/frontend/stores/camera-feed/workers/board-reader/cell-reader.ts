import type { CellReading } from "../../../../types";
import { BOARD_SIZE } from "./board.constants";
import { CELL_SIZE } from "./board.constants";
import { READING_MARGIN } from "./board.constants";
import { OUTER_PADDING } from "./board.constants";
import { WEAK_CONTRAST } from "./board.constants";
import { WEAK_ADDED_CONTRAST } from "./board.constants";
import { SNAPSHOT_LIFETIME_MS } from "./board.constants";
import { projectBoard } from "./board-image";
import { median } from "./board-image";
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

type CellFillInput = {
  geometry: CellGeometry;
  pixels: Float32Array;
  baseline: Float32Array;
  previous: Float32Array;
  readingGrid: Uint8Array;
  image: ImageData;
  transform: number[];
};

type ReadCellsInput = Omit<CellFillInput, "geometry"> & {
  paperRatios: number[];
  previousMarks?: CellReading["mark"][];
  snapshots?: (CellSnapshot | null)[];
  timestamp?: number;
};

// Returns the sampling box for one square.
function cellGeometry(cell: number): CellGeometry {
  const col = cell % 3,
    row = Math.floor(cell / 3);
  const originX = col === 0 ? -OUTER_PADDING : col * CELL_SIZE + READING_MARGIN;
  const originY = row === 0 ? -OUTER_PADDING : row * CELL_SIZE + READING_MARGIN;
  const endX = col === 2 ? BOARD_SIZE + OUTER_PADDING : (col + 1) * CELL_SIZE - READING_MARGIN;
  const endY = row === 2 ? BOARD_SIZE + OUTER_PADDING : (row + 1) * CELL_SIZE - READING_MARGIN;
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

// True when the square's core is still inside the picture.
function cellCovered(geometry: CellGeometry, image: ImageData, transform: number[]): boolean {
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

// True when a sample point lies inside the picture.
function isInImage(sx: number, sy: number, image: ImageData): boolean {
  return sx >= 0 && sy >= 0 && sx < image.width - 1 && sy < image.height - 1;
}

// True when a point lies on the 3x3 board.
function isOnBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

// True when a pixel is darker than the empty-board baseline.
function inkAgainstBaseline(pixels: Float32Array, at: number, reference: number): boolean {
  return pixels[at] > 0.2 && pixels[at] - reference > 0.16;
}

// True when ink sits on the picture edge.
function isClippedInk(sx: number, sy: number, image: ImageData): boolean {
  return Math.min(sx, sy, image.width - 1 - sx, image.height - 1 - sy) < 4;
}

// Measures how much darker a pixel is than its neighbors.
function localContrast(pixels: Float32Array, at: number, stride: number): number {
  const px = at % stride,
    py = Math.floor(at / stride);
  const acrossX = px >= 4 && px < stride - 4 ? Math.max(pixels[at - 4], pixels[at + 4]) : pixels[at];
  const acrossY = py >= 4 && py < stride - 4 ? Math.max(pixels[at - stride * 4], pixels[at + stride * 4]) : pixels[at];
  return pixels[at] - Math.min(acrossX, acrossY);
}

// True when a pixel is faint ink against the baseline.
function isWeakInk(input: { pixels: Float32Array; at: number; reference: number; stride: number }): boolean {
  const contrast = localContrast(input.pixels, input.at, input.stride);
  return contrast > 0.05 && input.pixels[input.at] > WEAK_CONTRAST && input.pixels[input.at] - input.reference > WEAK_ADDED_CONTRAST;
}

// Samples one board pixel into a cell mask.
function sampleCellPixel(input: CellFillInput & { x: number; y: number; sample: CellSample }): void {
  const { originX, originY, endX, endY, size } = input.geometry;
  const boardX = originX + input.x;
  const boardY = originY + input.y;
  if (boardX >= endX || boardY >= endY) return;
  const [sx, sy] = projectBoard(input.transform, boardX, boardY);
  if (!isInImage(sx, sy, input.image)) return;
  input.sample.sampled++;
  const stride = BOARD_SIZE + OUTER_PADDING * 2;
  const at = (boardY + OUTER_PADDING) * stride + boardX + OUTER_PADDING;
  const reference = isOnBoard(boardX, boardY) ? input.baseline[boardY * BOARD_SIZE + boardX] : 0;
  const index = input.y * size + input.x;
  input.sample.contrast[index] = Math.min(input.pixels[at], input.pixels[at] - reference);
  input.sample.gridMask[index] = input.readingGrid[at];
  const ink = inkAgainstBaseline(input.pixels, at, reference);
  input.sample.mask[index] = Number(ink);
  if (ink && isClippedInk(sx, sy, input.image)) input.sample.clippedInk = true;
  if (ink !== inkAgainstBaseline(input.previous, at, reference)) input.sample.changed++;
  input.sample.weakMask[index] = Number(isWeakInk({ pixels: input.pixels, at, reference, stride }));
}

// Builds ink and contrast masks for one square.
function fillCellSample(input: CellFillInput): CellSample {
  const { size } = input.geometry;
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
      sampleCellPixel({ ...input, x, y, sample });
    }
  }
  return sample;
}

// Classifies a square and may reuse a recent snapshot.
function resolveCellMark(input: { sample: CellSample; geometry: CellGeometry; snapshots: (CellSnapshot | null)[] | undefined; cell: number; imageReadable: boolean; timestamp: number }): CellReading {
  const reading = classifyMark({
    mask: input.sample.mask,
    size: input.geometry.size,
    weakMask: input.sample.weakMask,
    gridMask: input.sample.gridMask,
    bounds: input.geometry.core,
  });
  if (input.snapshots && input.imageReadable) return readSnapshot({ ...input, reading, snapshots: input.snapshots });
  return reading;
}

// Marks a reading readable once motion and coverage look good.
function finishCellReading(input: { reading: CellReading; sample: CellSample; geometry: CellGeometry; previousMarks: CellReading["mark"][] | undefined; cell: number; motion: number; usable: boolean; imageReadable: boolean }): CellReading {
  const consistentShape = (input.reading.mark === "X" || input.reading.mark === "O") && input.reading.confidence >= 0.84 && input.previousMarks?.[input.cell] === input.reading.mark;
  return {
    ...input.reading,
    ink: (input.reading.ink * (input.geometry.size * input.geometry.size)) / Math.max(1, input.sample.sampled),
    imageReadable: input.imageReadable,
    readable: input.usable && input.reading.mark !== "?" && (input.motion < 0.035 || (consistentShape && input.motion < 0.08)),
  };
}

// Reads one square from the warped board.
function readCell(input: ReadCellsInput & { cell: number }): CellReading {
  const geometry = cellGeometry(input.cell);
  const sample = fillCellSample({ ...input, geometry });
  const motion = sample.changed / Math.max(1, sample.sampled);
  const usable = cellCovered(geometry, input.image, input.transform) && !sample.clippedInk && input.paperRatios[input.cell] >= median(input.paperRatios) * 0.76;
  const imageReadable = usable && motion < 0.035;
  return finishCellReading({
    reading: resolveCellMark({
      sample,
      geometry,
      snapshots: input.snapshots,
      cell: input.cell,
      imageReadable,
      timestamp: input.timestamp ?? 0,
    }),
    sample,
    geometry,
    previousMarks: input.previousMarks,
    cell: input.cell,
    motion,
    usable,
    imageReadable,
  });
}

// Reads all nine squares from the current frame.
export function readCells(input: ReadCellsInput): CellReading[] {
  return Array.from({ length: 9 }, (_, cell) => readCell({ ...input, cell }));
}

// True when two ink masks overlap enough to match.
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

// Reuses a recent mark when the ink still matches.
function readSnapshot(input: { snapshots: (CellSnapshot | null)[]; cell: number; sample: CellSample; geometry: CellGeometry; reading: CellReading; timestamp: number }): CellReading {
  const saved = input.snapshots[input.cell];
  if (
    input.reading.mark === "?" &&
    saved?.reviewed &&
    input.timestamp - saved.capturedAt <= SNAPSHOT_LIFETIME_MS &&
    (saved.reading.mark === "X" || saved.reading.mark === "O") &&
    matchingInk(input.sample.mask, saved.sample.mask) &&
    matchingInk(input.sample.weakMask, saved.sample.weakMask) &&
    !hasUnsupportedInk(input.sample.weakMask, saved.sample.weakMask, input.geometry.size)
  ) {
    return { ...saved.reading, ink: input.reading.ink };
  }
  if (input.reading.mark === null) input.snapshots[input.cell] = null;
  else
    input.snapshots[input.cell] = {
      sample: input.sample,
      geometry: input.geometry,
      reading: input.reading,
      capturedAt: input.timestamp,
      reviewed: false,
    };
  return input.reading;
}

// Drops stale snapshots and retries unclear marks.
export function reviewSnapshots(snapshots: (CellSnapshot | null)[], timestamp: number): void {
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
      classifyMark({
        mask: Uint8Array.from(sample.contrast, (value) => Number(value > threshold)),
        size: geometry.size,
        weakMask: sample.weakMask,
        gridMask: sample.gridMask,
        bounds: geometry.core,
      }),
    );
    const marks = readings.filter((reading) => reading.mark === "X" || reading.mark === "O");
    if (marks.length >= 2 && marks.every((reading) => reading.mark === marks[0].mark))
      snapshot.reading = {
        ...marks[0],
        confidence: Math.min(0.86, ...marks.map((reading) => reading.confidence)),
      };
  });
}
