import type { CellReading } from "../../../../types";
import { projectUv } from "../../../../lib/board-geometry";
import { SNAPSHOT_LIFETIME_MS } from "./board.constants";
import { boardCorners } from "./board-image";
import {
  createCalibration,
  scoreBoardCandidate,
  type Calibration,
} from "./calibration";
import { findBoardCandidates } from "./grid-detection";
import { trackGrid } from "./grid-tracking";

function similarTransform(
  old: number[],
  next: number[],
  image: ImageData,
): boolean {
  const scale = Math.hypot(next[0], next[3]) / Math.hypot(old[0], old[3]);
  const angle = Math.abs(
    Math.atan2(next[3], next[0]) - Math.atan2(old[3], old[0]),
  );
  return (
    boardCorners(next, image).every(
      ({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
    ) &&
    scale >= 0.5 &&
    scale <= 2 &&
    angle <= Math.PI / 4
  );
}

function isContinuousReacquire(
  calibration: Calibration,
  timestamp: number,
  old: number[],
  next: number[],
): boolean {
  const intersections = [
    [1 / 3, 1 / 3],
    [2 / 3, 1 / 3],
    [2 / 3, 2 / 3],
    [1 / 3, 2 / 3],
  ];
  const previousIntersections = intersections.map(([u, v]) =>
    projectUv(old, u, v),
  );
  const cellWidth = Math.min(
    ...previousIntersections.flatMap((point, index) =>
      previousIntersections
        .slice(index + 1)
        .map((other) => Math.hypot(point[0] - other[0], point[1] - other[1])),
    ),
  );
  return (
    calibration.lastAlignedAt !== null &&
    timestamp - calibration.lastAlignedAt <= SNAPSHOT_LIFETIME_MS &&
    intersections.every(([u, v], index) => {
      const from = previousIntersections[index],
        to = projectUv(next, u, v);
      return Math.hypot(from[0] - to[0], from[1] - to[1]) < cellWidth / 2;
    })
  );
}

function applyCandidate(
  calibration: Calibration,
  candidate: Calibration,
  continuous: boolean,
): void {
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

function findMatchingBoard(
  image: ImageData,
  calibration: Calibration,
  confirmedBoard: CellReading["mark"][],
): { candidate: Calibration; score: number } | null {
  const old = calibration.transform;
  let best: { candidate: Calibration; score: number } | null = null;
  for (const corners of findBoardCandidates(image)) {
    try {
      const candidate = createCalibration(image, corners, "existing");
      if (!similarTransform(old, candidate.transform, image)) continue;
      const score = scoreBoardCandidate(
        image,
        calibration,
        candidate,
        confirmedBoard,
      );
      if (score >= 0.7 && (!best || score > best.score))
        best = { candidate, score };
    } catch {
      continue;
    }
  }
  return best;
}

function tryReacquireBoard(
  image: ImageData,
  calibration: Calibration,
  timestamp: number,
  confirmedBoard: CellReading["mark"][],
  aligned: boolean,
): { reacquired: boolean; registration: Registration | null } {
  if (timestamp < calibration.nextReacquireAt)
    return { reacquired: false, registration: null };
  calibration.nextReacquireAt =
    timestamp + (aligned && !calibration.pendingGrid ? 1200 : 200);
  const old = calibration.transform;
  const best = findMatchingBoard(image, calibration, confirmedBoard);
  if (!best) {
    calibration.pendingGrid = null;
    return { reacquired: false, registration: null };
  }
  const { candidate, score } = best;
  if (aligned && nearbyGrid(old, candidate.transform, image, 0.003)) {
    calibration.pendingGrid = null;
    return { reacquired: false, registration: null };
  }
  calibration.nextReacquireAt = timestamp + 200;
  const pending = calibration.pendingGrid;
  if (
    !pending ||
    timestamp - pending.lastSeen > SNAPSHOT_LIFETIME_MS ||
    !nearbyGrid(pending.transform, candidate.transform, image)
  ) {
    calibration.pendingGrid = {
      transform: candidate.transform,
      firstSeen: timestamp,
      lastSeen: timestamp,
    };
    return { reacquired: false, registration: null };
  }
  pending.lastSeen = timestamp;
  if (timestamp - pending.firstSeen < 150)
    return { reacquired: false, registration: null };
  const continuous = isContinuousReacquire(
    calibration,
    timestamp,
    old,
    candidate.transform,
  );
  applyCandidate(calibration, candidate, continuous);
  calibration.nextReacquireAt = timestamp + 1200;
  return {
    reacquired: !continuous,
    registration: {
      transform: candidate.transform,
      tracked: true,
      aligned: true,
      score,
    },
  };
}

function nearbyGrid(
  a: number[],
  b: number[],
  image: ImageData,
  tolerance = 0.035,
): boolean {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].every(([u, v]) => {
    const from = projectUv(a, u, v),
      to = projectUv(b, u, v);
    return (
      Math.hypot(from[0] - to[0], from[1] - to[1]) <
      Math.min(image.width, image.height) * tolerance
    );
  });
}

export function registerFrame(
  image: ImageData,
  calibration: Calibration,
  timestamp: number,
  confirmedBoard: CellReading["mark"][],
): { registration: Registration; reacquired: boolean } {
  let registration = trackGrid(
    image,
    calibration.transform,
    calibration.gridBaseline,
    calibration.grid,
  );
  let reacquired = false;
  if (registration.tracked) calibration.transform = registration.transform;
  if (!registration.aligned || timestamp >= calibration.nextReacquireAt) {
    const recovered = tryReacquireBoard(
      image,
      calibration,
      timestamp,
      confirmedBoard,
      registration.aligned,
    );
    reacquired = recovered.reacquired;
    if (recovered.registration) registration = recovered.registration;
  }
  if (registration.tracked) calibration.transform = registration.transform;
  if (registration.aligned) {
    calibration.lastAlignedAt = timestamp;
  }
  return { registration, reacquired };
}
