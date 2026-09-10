import type { CellReading } from "../../../../types";
import { projectUv } from "../../../../lib/board-geometry/board-geometry";
import { SNAPSHOT_LIFETIME_MS } from "./board.constants";
import { boardCorners } from "./board-image";
import { createCalibration } from "./calibration";
import { scoreBoardCandidate } from "./calibration";
import type { Calibration } from "./calibration";
import { findBoardCandidates } from "./grid-detection";
import { trackGrid } from "./grid-tracking";

// True when a new board warp is close to the old one.
function similarTransform(old: number[], next: number[], image: ImageData): boolean {
  const scale = Math.hypot(next[0], next[3]) / Math.hypot(old[0], old[3]);
  const angle = Math.abs(Math.atan2(next[3], next[0]) - Math.atan2(old[3], old[0]));
  return boardCorners(next, image).every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1) && scale >= 0.5 && scale <= 2 && angle <= Math.PI / 4;
}

// True when the board only drifted a little since the last lock.
function isContinuousReacquire(input: { calibration: Calibration; timestamp: number; old: number[]; next: number[] }): boolean {
  const intersections = [
    [1 / 3, 1 / 3],
    [2 / 3, 1 / 3],
    [2 / 3, 2 / 3],
    [1 / 3, 2 / 3],
  ];
  const previousIntersections = intersections.map(([u, v]) => projectUv(input.old, u, v));
  const cellWidth = Math.min(...previousIntersections.flatMap((point, index) => previousIntersections.slice(index + 1).map((other) => Math.hypot(point[0] - other[0], point[1] - other[1]))));
  return (
    input.calibration.lastAlignedAt !== null &&
    input.timestamp - input.calibration.lastAlignedAt <= SNAPSHOT_LIFETIME_MS &&
    intersections.every(([u, v], index) => {
      const from = previousIntersections[index],
        to = projectUv(input.next, u, v);
      return Math.hypot(from[0] - to[0], from[1] - to[1]) < cellWidth / 2;
    })
  );
}

// Copies a new calibration onto the live one.
function applyCandidate(calibration: Calibration, candidate: Calibration, continuous: boolean): void {
  const previous = calibration.previous,
    readingPrevious = calibration.readingPrevious,
    cellMarks = calibration.cellMarks,
    snapshots = calibration.snapshots;
  Object.assign(calibration, candidate);
  if (continuous) {
    calibration.previous = previous;
    calibration.readingPrevious = readingPrevious;
    calibration.cellMarks = cellMarks;
    calibration.snapshots = snapshots;
  }
}

type Registration = {
  transform: number[];
  tracked: boolean;
  aligned: boolean;
  score: number;
};

// Finds the best board candidate that matches the old grid.
function findMatchingBoard(image: ImageData, calibration: Calibration, confirmedBoard: CellReading["mark"][]): { candidate: Calibration; score: number } | null {
  const old = calibration.transform;
  let best: { candidate: Calibration; score: number } | null = null;
  for (const corners of findBoardCandidates(image)) {
    try {
      const candidate = createCalibration(image, corners, "existing");
      if (!similarTransform(old, candidate.transform, image)) continue;
      const score = scoreBoardCandidate({ image, original: calibration, candidate, confirmedBoard });
      if (score >= 0.7 && (!best || score > best.score)) best = { candidate, score };
    } catch {
      continue;
    }
  }
  return best;
}

// Locks a pending grid once it has stayed in view.
function acceptPendingGrid(input: { image: ImageData; calibration: Calibration; candidate: Calibration; score: number; timestamp: number; old: number[] }): { reacquired: boolean; registration: Registration | null } {
  const pending = input.calibration.pendingGrid;
  if (!pending || input.timestamp - pending.lastSeen > SNAPSHOT_LIFETIME_MS || !nearbyGrid({ a: pending.transform, b: input.candidate.transform, image: input.image })) {
    input.calibration.pendingGrid = {
      transform: input.candidate.transform,
      firstSeen: input.timestamp,
      lastSeen: input.timestamp,
    };
    return { reacquired: false, registration: null };
  }
  pending.lastSeen = input.timestamp;
  if (input.timestamp - pending.firstSeen < 150) return { reacquired: false, registration: null };
  const continuous = isContinuousReacquire({
    calibration: input.calibration,
    timestamp: input.timestamp,
    old: input.old,
    next: input.candidate.transform,
  });
  applyCandidate(input.calibration, input.candidate, continuous);
  input.calibration.nextReacquireAt = input.timestamp + 1200;
  return {
    reacquired: !continuous,
    registration: {
      transform: input.candidate.transform,
      tracked: true,
      aligned: true,
      score: input.score,
    },
  };
}

// Looks for the grid again when tracking is weak.
function tryReacquireBoard(input: { image: ImageData; calibration: Calibration; timestamp: number; confirmedBoard: CellReading["mark"][]; aligned: boolean }): { reacquired: boolean; registration: Registration | null } {
  if (input.timestamp < input.calibration.nextReacquireAt) return { reacquired: false, registration: null };
  input.calibration.nextReacquireAt = input.timestamp + (input.aligned && !input.calibration.pendingGrid ? 1200 : 200);
  const old = input.calibration.transform;
  const best = findMatchingBoard(input.image, input.calibration, input.confirmedBoard);
  if (!best) {
    input.calibration.pendingGrid = null;
    return { reacquired: false, registration: null };
  }
  const { candidate, score } = best;
  if (input.aligned && nearbyGrid({ a: old, b: candidate.transform, image: input.image, tolerance: 0.003 })) {
    input.calibration.pendingGrid = null;
    return { reacquired: false, registration: null };
  }
  input.calibration.nextReacquireAt = input.timestamp + 200;
  return acceptPendingGrid({ ...input, candidate, score, old });
}

// True when two board warps share nearly the same corners.
function nearbyGrid(input: { a: number[]; b: number[]; image: ImageData; tolerance?: number }): boolean {
  const tolerance = input.tolerance ?? 0.035;
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].every(([u, v]) => {
    const from = projectUv(input.a, u, v),
      to = projectUv(input.b, u, v);
    return Math.hypot(from[0] - to[0], from[1] - to[1]) < Math.min(input.image.width, input.image.height) * tolerance;
  });
}

// Tracks or reacquires the board for this frame.
export function registerFrame(input: { image: ImageData; calibration: Calibration; timestamp: number; confirmedBoard: CellReading["mark"][] }): { registration: Registration; reacquired: boolean } {
  let registration = trackGrid({
    image: input.image,
    transform: input.calibration.transform,
    baseline: input.calibration.gridBaseline,
    grid: input.calibration.grid,
  });
  let reacquired = false;
  if (registration.tracked) input.calibration.transform = registration.transform;
  if (!registration.aligned || input.timestamp >= input.calibration.nextReacquireAt) {
    const recovered = tryReacquireBoard({ ...input, aligned: registration.aligned });
    reacquired = recovered.reacquired;
    if (recovered.registration) registration = recovered.registration;
  }
  if (registration.tracked) input.calibration.transform = registration.transform;
  if (registration.aligned) {
    input.calibration.lastAlignedAt = input.timestamp;
  }
  return { registration, reacquired };
}
