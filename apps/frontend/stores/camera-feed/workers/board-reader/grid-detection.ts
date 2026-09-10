import type { Point } from "../../../../types";
import type { Corners } from "../../../../types";
import { quadrilateralTransform } from "../../../../lib/board-geometry/board-geometry";
import { luma } from "./board-image";
import { boardTransform } from "./board-image";
import { createCalibration } from "./calibration";
import { scoreBoardCandidate } from "./calibration";
import { cleanPaperImage } from "../../../../lib/paper-image/paper-image";

type Line = { slope: number; offset: number; votes: number };

// Finds dark ink points that look like thin strokes.
function inkPoints(image: ImageData) {
  const scale = Math.min(1, 360 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (Math.min(image.height - 1, Math.round(y / scale)) * image.width + Math.min(image.width - 1, Math.round(x / scale))) * 4;
      gray[y * width + x] = luma(image.data, at);
    }
  }
  const { pixels, background } = cleanPaperImage(gray, width, height);
  const points: Point[] = [];
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      const at = y * width + x;
      const mean = background[at];
      const threshold = Math.max(24, mean * 0.2);
      // Ink has lighter paper on both sides. A page edge or broad shadow
      // only has a lighter side, even when it wins the line vote.
      const across = Math.max(Math.min(pixels[at - 4], pixels[at + 4]), Math.min(pixels[at - width * 4], pixels[at + width * 4]));
      if (pixels[at] < mean - threshold && pixels[at] < across - threshold) points.push({ x, y });
    }
  }
  return { points, width, height, scale };
}

// Votes for the strongest grid lines in one direction.
function findLines(input: { points: Point[]; width: number; height: number; vertical: boolean }): Line[] {
  const extent = Math.max(input.width, input.height);
  const peaks: Line[] = [];
  for (let degrees = -35; degrees <= 35; degrees++) {
    const slope = Math.tan((degrees * Math.PI) / 180);
    const votes = new Uint16Array(extent * 3);
    for (const point of input.points) {
      const offset = input.vertical ? point.x - slope * point.y : point.y - slope * point.x;
      votes[Math.round(offset) + extent]++;
    }
    for (let index = 1; index < votes.length - 1; index++) {
      const count = votes[index - 1] + votes[index] + votes[index + 1];
      if (count > Math.min(input.width, input.height) * 0.28) peaks.push({ slope, offset: index - extent, votes: count });
    }
  }
  const ranked = peaks.toSorted((a, b) => b.votes - a.votes);
  const lines: Line[] = [];
  const length = input.vertical ? input.height : input.width;
  for (const peak of ranked) {
    if (lines.some((line) => [0.2, 0.8].every((fraction) => Math.abs((line.slope - peak.slope) * length * fraction + line.offset - peak.offset) < 9))) continue;
    lines.push(peak);
    if (lines.length === 10) break;
  }
  return lines.toSorted((a, b) => ((a.slope - b.slope) * length) / 2 + a.offset - b.offset);
}

// Returns where a vertical and horizontal line meet.
function intersection(vertical: Line, horizontal: Line): Point {
  const y = (horizontal.slope * vertical.offset + horizontal.offset) / (1 - horizontal.slope * vertical.slope);
  return { x: vertical.slope * y + vertical.offset, y };
}

// Builds board corners from four inner grid lines.
function scoreCandidate(input: { v1: Line; v2: Line; h1: Line; h2: Line; scale: number; image: ImageData }): { corners: Corners; score: number } | null {
  const center = [intersection(input.v1, input.h1), intersection(input.v2, input.h1), intersection(input.v2, input.h2), intersection(input.v1, input.h2)];
  if (
    center.some((point, index) => {
      const next = center[(index + 1) % 4];
      return Math.hypot(point.x - next.x, point.y - next.y) < 20;
    })
  )
    return null;
  try {
    // The four inner intersections bound the middle cell. Extend its
    // perspective transform by one cell on each side to get the board.
    const [a, b, c, d, e, f, g, h] = quadrilateralTransform(center);
    const corners = [
      [-1, -1],
      [2, -1],
      [2, 2],
      [-1, 2],
    ].map(([u, v]) => {
      const denominator = g * u + h * v + 1;
      if (denominator <= 0.1) throw new Error("Extreme perspective");
      return {
        x: (a * u + b * v + c) / denominator / input.scale / (input.image.width - 1),
        y: (d * u + e * v + f) / denominator / input.scale / (input.image.height - 1),
      };
    }) as Corners;
    boardTransform(corners, input.image.width, input.image.height);
    return {
      corners,
      score: input.v1.votes + input.v2.votes + input.h1.votes + input.h2.votes,
    };
  } catch {
    return null;
  }
}

// Adds a scored board candidate when the corners are valid.
function addCandidate(input: { candidates: { corners: Corners; score: number }[]; v1: Line; v2: Line; h1: Line; h2: Line; scale: number; image: ImageData }): void {
  const candidate = scoreCandidate(input);
  if (candidate) input.candidates.push(candidate);
}

// Lists likely 3x3 boards from voted grid lines.
export function findBoardCandidates(image: ImageData): Corners[] {
  const { points, width, height, scale } = inkPoints(image);
  if (points.length < 100 || points.length > width * height * 0.2) return [];
  const vertical = findLines({ points, width, height, vertical: true });
  const horizontal = findLines({ points, width, height, vertical: false });
  const candidates: { corners: Corners; score: number }[] = [];
  for (let left = 0; left < vertical.length; left++) {
    for (let right = left + 1; right < vertical.length; right++) {
      for (let top = 0; top < horizontal.length; top++) {
        for (let bottom = top + 1; bottom < horizontal.length; bottom++) {
          addCandidate({
            candidates,
            v1: vertical[left],
            v2: vertical[right],
            h1: horizontal[top],
            h2: horizontal[bottom],
            scale,
            image,
          });
        }
      }
    }
  }
  return candidates
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 24)
    .map((candidate) => candidate.corners);
}

// Returns the best board corners, or none.
export function detectBoard(image: ImageData): Corners | null {
  let best: { corners: Corners; score: number } | null = null;
  for (const corners of findBoardCandidates(image)) {
    try {
      const candidate = createCalibration(image, corners, "existing");
      const score = scoreBoardCandidate({ image, original: candidate, candidate, confirmedBoard: [] });
      if (score >= 0.7 && (!best || score > best.score)) best = { corners, score };
    } catch {
      continue;
    }
  }
  return best?.corners ?? null;
}
