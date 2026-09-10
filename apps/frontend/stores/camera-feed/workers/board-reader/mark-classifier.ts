import type { CellReading } from "../../../../types";
import { components } from "./ink-components";
import { enclosedCenter } from "./ink-components";
import { isStructuredInk } from "./ink-components";
import { removeGridFragments } from "./ink-components";
import { closeSmallGaps } from "./ink-components";
import { hasUnsupportedInk } from "./ink-components";
import type { Component } from "./ink-components";

type ShapeAccum = {
  arms: number[];
  quadrants: Uint8Array;
  ringBins: Uint8Array;
  diagonalBins: Uint16Array[];
  onDiagonal: number;
  onRing: number;
  centerInk: number;
  innerInk: number;
};

type ShapeFeatures = {
  count: number;
  diagonalFit: number;
  ringFit: number;
  xComplete: boolean;
  hole: number;
  centerInk: number;
  innerInk: number;
  fragmented: boolean;
  quadrants: Uint8Array;
  ringBins: Uint8Array;
};

// Returns an unclear mark reading.
function unknownReading(ink: number, confidence = 0.25): CellReading {
  return { mark: "?", confidence, ink };
}

// Picks the main ink blob, or merges fragments.
function resolveLargest(groups: Component[], total: number): { component: Component; fragmented: boolean } | null {
  const significant = groups.filter((group) => group.points.length >= Math.max(5, total * 0.025));
  let largest = significant[0];
  if (!largest || largest.points.length < 20 || significant.length > 3) return null;
  const retained = significant.flatMap((group) => group.points);
  const fragmented = groups.some((group) => group !== largest && isStructuredInk(group)) || largest.points.length / retained.length < 0.88;
  if (fragmented) {
    largest = {
      points: retained,
      minX: Math.min(...significant.map((group) => group.minX)),
      maxX: Math.max(...significant.map((group) => group.maxX)),
      minY: Math.min(...significant.map((group) => group.minY)),
      maxY: Math.max(...significant.map((group) => group.maxY)),
    };
  }
  return { component: largest, fragmented };
}

// True when a blob is large enough and stays inside the square.
function validShapeBounds(largest: Component, size: number): boolean {
  const width = largest.maxX - largest.minX + 1;
  const height = largest.maxY - largest.minY + 1;
  if (width < 17 || height < 17 || width / height < 0.48 || width / height > 2.1) return false;
  if (largest.minX < 2 || largest.minY < 2 || largest.maxX > size - 3 || largest.maxY > size - 3) return false;
  const density = largest.points.length / (width * height);
  return density <= 0.48 && density >= 0.035;
}

// Adds one point to the X diagonal scores.
function addDiagonalFeatures(accum: ShapeAccum, u: number, v: number): void {
  const distanceA = Math.abs(u - v);
  const distanceB = Math.abs(u + v - 1);
  if (Math.min(distanceA, distanceB) < 0.19) accum.onDiagonal++;
  if (distanceA < 0.19) accum.diagonalBins[0][Math.min(7, Math.floor((u + v) * 4))]++;
  if (distanceB < 0.19) accum.diagonalBins[1][Math.min(7, Math.floor((u + 1 - v) * 4))]++;
}

// Adds one point to the center and corner scores.
function addRegionFeatures(accum: ShapeAccum, u: number, v: number): void {
  if (Math.abs(u - 0.5) < 0.13 && Math.abs(v - 0.5) < 0.13) accum.centerInk++;
  if (Math.abs(u - 0.5) < 0.2 && Math.abs(v - 0.5) < 0.2) accum.innerInk++;
  if (u < 0.35 && v < 0.35) accum.arms[0]++;
  if (u > 0.65 && v < 0.35) accum.arms[1]++;
  if (u < 0.35 && v > 0.65) accum.arms[2]++;
  if (u > 0.65 && v > 0.65) accum.arms[3]++;
}

// Adds one point to the O ring scores.
function addRingFeatures(accum: ShapeAccum, u: number, v: number): void {
  const radius = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
  const angle = (Math.atan2(v - 0.5, u - 0.5) + Math.PI) / (Math.PI * 2);
  accum.quadrants[Math.min(15, Math.floor(angle * 16))] = 1;
  if (radius > 0.67 && radius < 1.24) {
    accum.onRing++;
    accum.ringBins[Math.min(47, Math.floor(angle * 48))] = 1;
  }
}

// Measures how well a blob looks like an X or O.
function scoreShapeFeatures(largest: Component, size: number, fragmented: boolean): ShapeFeatures {
  const width = largest.maxX - largest.minX + 1;
  const height = largest.maxY - largest.minY + 1;
  const accum: ShapeAccum = {
    arms: [0, 0, 0, 0],
    quadrants: new Uint8Array(16),
    ringBins: new Uint8Array(48),
    diagonalBins: [new Uint16Array(8), new Uint16Array(8)],
    onDiagonal: 0,
    onRing: 0,
    centerInk: 0,
    innerInk: 0,
  };
  const clean = new Uint8Array(size * size);
  for (const at of largest.points) {
    clean[at] = 1;
    const u = ((at % size) - largest.minX) / (width - 1);
    const v = (Math.floor(at / size) - largest.minY) / (height - 1);
    addDiagonalFeatures(accum, u, v);
    addRegionFeatures(accum, u, v);
    addRingFeatures(accum, u, v);
  }
  const count = largest.points.length;
  return {
    count,
    diagonalFit: accum.onDiagonal / count,
    ringFit: accum.onRing / count,
    xComplete: accum.arms.every((arm) => arm / count > 0.025) && accum.diagonalBins.every((bins) => Array.from(bins).filter((bin) => bin >= 2).length >= 6),
    hole: enclosedCenter(clean, size, largest),
    centerInk: accum.centerInk,
    innerInk: accum.innerInk,
    fragmented,
    quadrants: accum.quadrants,
    ringBins: accum.ringBins,
  };
}

// Returns an X reading when the shape fits.
function decideX(features: ShapeFeatures, ink: number): CellReading | null {
  const { count, diagonalFit, xComplete, hole, centerInk, fragmented } = features;
  if ((fragmented && diagonalFit < 0.9) || diagonalFit < 0.82 || centerInk / count < 0.035 || !xComplete || hole >= 0.04) return null;
  return {
    mark: "X",
    confidence: fragmented ? 0.86 : Math.min(0.99, 0.88 + (diagonalFit - 0.82) * 0.65),
    ink,
  };
}

// Returns an O reading when the shape fits.
function decideO(features: ShapeFeatures, ink: number): CellReading | null {
  const { count, ringFit, hole, innerInk, quadrants, ringBins } = features;
  const closedHandwrittenLoop = !features.fragmented && hole > 0.24 && ringFit >= 0.78 && innerInk / count < 0.025 && quadrants.every(Boolean);
  if ((!closedHandwrittenLoop && ringFit < 0.86) || innerInk / count >= 0.055) return null;
  const nearlyClosed = ringFit >= 0.94 && innerInk / count < 0.025 && ringBins.reduce((sum, filled) => sum + filled, 0) >= 45;
  if (!((hole > 0.16 && quadrants.every(Boolean)) || nearlyClosed)) return null;
  return {
    mark: "O",
    confidence: ringFit < 0.86 ? 0.84 : hole > 0.16 ? Math.min(0.99, 0.89 + (ringFit - 0.86) * 0.6) : 0.84,
    ink,
  };
}

// Chooses X, O, or unknown from shape scores.
function decideMark(features: ShapeFeatures, ink: number): CellReading {
  return decideX(features, ink) ?? decideO(features, ink) ?? unknownReading(ink, Math.min(0.7, Math.max(features.diagonalFit, features.ringFit) * 0.65));
}

// Classifies one ink mask as empty, X, O, or unknown.
function classifyShape(input: { mask: Uint8Array; size: number; weakMask?: Uint8Array; gridMask?: Uint8Array }): CellReading {
  let { mask, weakMask } = input;
  mask = closeSmallGaps(removeGridFragments(mask, input.size, input.gridMask), input.size);
  if (weakMask) weakMask = removeGridFragments(weakMask, input.size, input.gridMask);
  const groups = components(mask, input.size);
  const total = groups.reduce((count, group) => count + group.points.length, 0);
  const ink = total / mask.length;
  if (weakMask && hasUnsupportedInk(weakMask, mask, input.size)) return unknownReading(ink, 0.35);
  if (total < 8) return { mark: null, confidence: total === 0 ? 0.99 : 0.92, ink };
  if (ink > 0.33) return unknownReading(ink, 0.05);
  const resolved = resolveLargest(groups, total);
  if (!resolved) return unknownReading(ink);
  if (!validShapeBounds(resolved.component, input.size)) return unknownReading(ink);
  return decideMark(scoreShapeFeatures(resolved.component, input.size, resolved.fragmented), ink);
}

type ContentBounds = { minX: number; minY: number; maxX: number; maxY: number };

// Drops ink that sits outside the square core.
function keepCellContent(mask: Uint8Array, size: number, bounds: ContentBounds): Uint8Array {
  const clean = mask.slice();
  const groups = components(mask, size);
  const inside = groups.filter((group) =>
    group.points.some((at) => {
      const x = at % size,
        y = Math.floor(at / size);
      return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }),
  );
  for (const group of groups) {
    if (inside.includes(group)) continue;
    const continuation = inside.some((part) => Math.hypot(Math.max(0, group.minX - part.maxX, part.minX - group.maxX), Math.max(0, group.minY - part.maxY, part.minY - group.maxY)) <= 6);
    if (!continuation) for (const at of group.points) clean[at] = 0;
  }
  return clean;
}

// Reads a mark from strong ink, then faint ink if needed.
export function classifyMark(input: { mask: Uint8Array; size: number; weakMask?: Uint8Array; gridMask?: Uint8Array; bounds?: ContentBounds }): CellReading {
  let { mask, weakMask } = input;
  if (input.bounds) {
    mask = keepCellContent(mask, input.size, input.bounds);
    if (weakMask) weakMask = keepCellContent(weakMask, input.size, input.bounds);
  }
  const strong = classifyShape({ mask, size: input.size, weakMask, gridMask: input.gridMask });
  if (strong.mark !== "?" || !weakMask) return strong;
  const faint = classifyShape({ mask: weakMask, size: input.size, gridMask: input.gridMask });
  if (faint.mark !== "X" && faint.mark !== "O") return strong;
  if (hasUnsupportedInk(removeGridFragments(mask, input.size, input.gridMask), removeGridFragments(weakMask, input.size, input.gridMask), input.size)) return strong;
  const strongInk = mask.reduce((sum, value) => sum + value, 0);
  const faintInk = weakMask.reduce((sum, value) => sum + value, 0);
  if (strongInk < faintInk * 0.35) return strong;
  return { ...faint, confidence: Math.min(0.86, faint.confidence) };
}
