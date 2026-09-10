import { BOARD_SIZE, CELL_SIZE } from "./board.constants";
import { projectBoard, luminance } from "./board-image";

type Sample = {
  x: number;
  y: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  contrast: number;
  segment: number;
};

type Adjustment = { dx: number; dy: number; angle: number; scale: number };

type Evaluation = { score: number; supported: boolean };

type SearchState = { best: Adjustment; result: Evaluation };

type TrackContext = {
  image: ImageData;
  samples: Sample[];
  centerX: number;
  centerY: number;
  translationLimit: number;
};

function lineSampleIndex(
  vertical: boolean,
  along: number,
  divider: number,
  offset: number,
): number {
  return vertical
    ? along * BOARD_SIZE + divider + offset
    : (divider + offset) * BOARD_SIZE + along;
}

function sampleAlongLine(
  transform: number[],
  baseline: Float32Array,
  ink: Set<number>,
  line: number,
  along: number,
): Sample | null {
  if ([CELL_SIZE, CELL_SIZE * 2].some((at) => Math.abs(along - at) < 15))
    return null;
  const vertical = line < 2;
  const divider = ((line % 2) + 1) * CELL_SIZE;
  let strongest = -1;
  for (let offset = -10; offset <= 10; offset++) {
    const at = lineSampleIndex(vertical, along, divider, offset);
    if (ink.has(at) && baseline[at] > strongest) strongest = baseline[at];
  }
  if (strongest < 0.25) return null;
  let total = 0;
  let weighted = 0;
  for (let offset = -10; offset <= 10; offset++) {
    const at = lineSampleIndex(vertical, along, divider, offset);
    if (ink.has(at) && baseline[at] >= strongest * 0.8) {
      total += baseline[at];
      weighted += (divider + offset) * baseline[at];
    }
  }
  const across = Math.round(weighted / total);
  const x = vertical ? across : along;
  const y = vertical ? along : across;
  const normalX = vertical ? 7 : 0;
  const normalY = vertical ? 0 : 7;
  const before = baseline[(y - normalY) * BOARD_SIZE + x - normalX];
  const after = baseline[(y + normalY) * BOARD_SIZE + x + normalX];
  const contrast = strongest - Math.max(before, after);
  if (contrast < 0.2) return null;
  const [px, py] = projectBoard(transform, x, y);
  const [ax, ay] = projectBoard(transform, x - normalX, y - normalY);
  const [bx, by] = projectBoard(transform, x + normalX, y + normalY);
  return {
    x: px,
    y: py,
    ax,
    ay,
    bx,
    by,
    contrast,
    segment: line * 3 + Math.floor(along / CELL_SIZE),
  };
}

export function gridSamples(
  transform: number[],
  baseline: Float32Array,
  grid: number[],
): Sample[] {
  const ink = new Set(grid);
  const samples: Sample[] = [];
  for (let line = 0; line < 4; line++) {
    for (let along = 16; along < BOARD_SIZE - 16; along += 8) {
      const sample = sampleAlongLine(transform, baseline, ink, line, along);
      if (sample) samples.push(sample);
    }
  }
  return samples;
}

export function evaluateAdjustment(
  context: TrackContext,
  { dx, dy, angle, scale }: Adjustment,
): Evaluation {
  const cosine = Math.cos(angle) * scale;
  const sine = Math.sin(angle) * scale;
  const { image, samples, centerX, centerY } = context;
  const read = (x: number, y: number) =>
    luminance(
      image,
      centerX + dx + cosine * (x - centerX) - sine * (y - centerY),
      centerY + dy + sine * (x - centerX) + cosine * (y - centerY),
    );
  const sums = new Float64Array(12);
  const counts = new Uint8Array(12);
  for (const sample of samples) {
    const paper = Math.min(
      read(sample.ax, sample.ay),
      read(sample.bx, sample.by),
    );
    const ink = read(sample.x, sample.y);
    const contrast = Math.max(0, (paper - ink) / Math.max(80, paper));
    sums[sample.segment] += Number.isFinite(contrast)
      ? Math.min(1, contrast / sample.contrast)
      : 0;
    counts[sample.segment]++;
  }
  const segments = Array.from(
    sums,
    (value, at) => value / Math.max(1, counts[at]),
  );
  const available = segments.filter((_, index) => counts[index] > 0);
  const support = available.filter((value) => value >= 0.3).length;
  const lines = [0, 1, 2, 3].filter((line) =>
    segments.slice(line * 3, line * 3 + 3).some((value) => value >= 0.3),
  ).length;
  const retained = Math.max(1, Math.ceil(available.length * 0.75));
  const score =
    available
      .toSorted((a, b) => b - a)
      .slice(0, retained)
      .reduce((sum, value) => sum + value, 0) / retained;
  return {
    score,
    supported:
      support >= Math.max(4, Math.ceil(available.length * 0.58)) && lines === 4,
  };
}

function considerAdjustment(
  context: TrackContext,
  state: SearchState,
  candidate: Adjustment,
): void {
  if (
    Math.abs(candidate.dx) > context.translationLimit ||
    Math.abs(candidate.dy) > context.translationLimit ||
    Math.abs(candidate.angle) > Math.PI / 60 ||
    Math.abs(candidate.scale - 1) > 0.040001
  )
    return;
  const reading = evaluateAdjustment(context, candidate);
  if (
    reading.supported &&
    (!state.result.supported || reading.score > state.result.score)
  ) {
    state.best = candidate;
    state.result = reading;
  }
}

function searchAdjustments(context: TrackContext, state: SearchState): void {
  for (const angle of [-Math.PI / 60, 0, Math.PI / 60]) {
    for (const scale of [0.96, 1, 1.04]) {
      for (let dx = -24; dx <= 24; dx += 3) {
        for (let dy = -24; dy <= 24; dy += 3)
          considerAdjustment(context, state, { dx, dy, angle, scale });
      }
    }
  }
  if (!state.result.supported || state.result.score < 0.56) {
    const anchor = state.best;
    const extent = Math.floor(context.translationLimit / 3) * 3;
    for (let dx = -extent; dx <= extent; dx += 3) {
      for (let dy = -extent; dy <= extent; dy += 3) {
        if (Math.abs(dx) <= 24 && Math.abs(dy) <= 24) continue;
        considerAdjustment(context, state, { ...anchor, dx, dy });
      }
    }
  }
}

function refineAdjustment(
  context: TrackContext,
  state: SearchState,
  step: number,
): void {
  const anchor = state.best;
  for (const x of [-step, 0, step]) {
    for (const y of [-step, 0, step]) {
      for (const angle of [
        (-step * Math.PI) / 180,
        0,
        (step * Math.PI) / 180,
      ]) {
        for (const scale of [-step * 0.005, 0, step * 0.005]) {
          considerAdjustment(context, state, {
            dx: anchor.dx + x,
            dy: anchor.dy + y,
            angle: anchor.angle + angle,
            scale: anchor.scale + scale,
          });
        }
      }
    }
  }
}

function adjustedTransform(
  transform: number[],
  centerX: number,
  centerY: number,
  best: Adjustment,
): number[] {
  const cosine = Math.cos(best.angle) * best.scale;
  const sine = Math.sin(best.angle) * best.scale;
  const tx = centerX + best.dx - cosine * centerX + sine * centerY;
  const ty = centerY + best.dy - sine * centerX - cosine * centerY;
  return [
    cosine * transform[0] - sine * transform[3] + tx * transform[6],
    cosine * transform[1] - sine * transform[4] + tx * transform[7],
    cosine * transform[2] - sine * transform[5] + tx,
    sine * transform[0] + cosine * transform[3] + ty * transform[6],
    sine * transform[1] + cosine * transform[4] + ty * transform[7],
    sine * transform[2] + cosine * transform[5] + ty,
    transform[6],
    transform[7],
    1,
  ];
}

export function trackGrid(
  image: ImageData,
  transform: number[],
  baseline: Float32Array,
  grid: number[],
): { transform: number[]; tracked: boolean; aligned: boolean; score: number } {
  const samples = gridSamples(transform, baseline, grid);
  if (samples.length < 16)
    return { transform, tracked: false, aligned: false, score: 0 };
  const [centerX, centerY] = projectBoard(
    transform,
    (BOARD_SIZE - 1) / 2,
    (BOARD_SIZE - 1) / 2,
  );
  const context: TrackContext = {
    image,
    samples,
    centerX,
    centerY,
    translationLimit: Math.max(
      25,
      Math.min(60, Math.min(image.width, image.height) * 0.05),
    ),
  };
  const zero: Adjustment = { dx: 0, dy: 0, angle: 0, scale: 1 };
  const initial = evaluateAdjustment(context, zero);
  if (initial.score >= 0.93 && initial.supported)
    return {
      transform,
      tracked: false,
      aligned: initial.supported && initial.score >= 0.56,
      score: initial.score,
    };
  const state: SearchState = { best: zero, result: initial };
  searchAdjustments(context, state);
  for (const step of [3, 1]) refineAdjustment(context, state, step);
  if (
    !state.result.supported ||
    state.result.score < 0.56 ||
    (initial.supported && state.result.score < initial.score + 0.055)
  )
    return {
      transform,
      tracked: false,
      aligned: initial.supported && initial.score >= 0.56,
      score: initial.score,
    };
  return {
    transform: adjustedTransform(transform, centerX, centerY, state.best),
    tracked: true,
    aligned: true,
    score: state.result.score,
  };
}
