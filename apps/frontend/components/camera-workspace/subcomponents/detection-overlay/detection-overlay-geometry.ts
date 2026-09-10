import { segmentedRing } from "../../../../lib/segmented-ring/segmented-ring";
import { quadrilateralTransform } from "../../../../lib/board-geometry/board-geometry";
import { projectUv } from "../../../../lib/board-geometry/board-geometry";
import type { Point } from "../../../../types";

export type OverlayPoint = { x: number; y: number };
export type OverlayLine = { start: OverlayPoint; end: OverlayPoint };
export type OverlayCellGeometry = {
  outline: string;
  label: OverlayPoint;
  center: OverlayPoint;
  cross: [OverlayPoint, OverlayPoint][];
  ring: string;
  ringGuide: string;
};
export type OverlayGeometry = {
  outline: string;
  lines: OverlayLine[];
  cells: OverlayCellGeometry[];
};

// Maps a board UV point onto the 1000 by 1000 overlay.
function projectPoint(coeffs: number[], u: number, v: number): OverlayPoint {
  const [x, y] = projectUv(coeffs, u, v);
  return { x: x * 1000, y: y * 1000 };
}

// Builds an SVG point list for a rectangle on the board.
function polygon(coeffs: number[], box: { left: number; top: number; right: number; bottom: number }): string {
  return [projectPoint(coeffs, box.left, box.top), projectPoint(coeffs, box.right, box.top), projectPoint(coeffs, box.right, box.bottom), projectPoint(coeffs, box.left, box.bottom)].map(({ x, y }) => `${x},${y}`).join(" ");
}

// Builds a 32-point ring for an O in one cell.
function cellRing(coeffs: number[], left: number, top: number): string {
  return Array.from({ length: 32 }, (_ringValue, step) => {
    const angle = (step * Math.PI * 2) / 32;
    const { x, y } = projectPoint(coeffs, left + 1 / 6 + Math.cos(angle) * 0.085, top + 1 / 6 + Math.sin(angle) * 0.085);
    return `${x},${y}`;
  }).join(" ");
}

// Computes outline, label, cross, and ring for one cell.
function cellGeometry(coeffs: number[], index: number): OverlayCellGeometry {
  const left = (index % 3) / 3;
  const top = Math.floor(index / 3) / 3;
  return {
    outline: polygon(coeffs, {
      left: left + 0.025,
      top: top + 0.025,
      right: left + 1 / 3 - 0.025,
      bottom: top + 1 / 3 - 0.025,
    }),
    label: projectPoint(coeffs, left + 0.035, top + 0.035),
    center: projectPoint(coeffs, left + 1 / 6, top + 1 / 6),
    cross: [
      [projectPoint(coeffs, left + 0.1, top + 0.1), projectPoint(coeffs, left + 0.23, top + 0.23)],
      [projectPoint(coeffs, left + 0.23, top + 0.1), projectPoint(coeffs, left + 0.1, top + 0.23)],
    ],
    ring: cellRing(coeffs, left, top),
    ringGuide: segmentedRing((x, y) => {
      const point = projectPoint(coeffs, left + 1 / 6 + x * 0.085, top + 1 / 6 + y * 0.085);
      return [point.x, point.y];
    }),
  };
}

// Returns the four inner grid lines of the board.
function gridLines(coeffs: number[]): OverlayLine[] {
  return [1 / 3, 2 / 3].flatMap((position) => [
    {
      start: projectPoint(coeffs, position, 0),
      end: projectPoint(coeffs, position, 1),
    },
    {
      start: projectPoint(coeffs, 0, position),
      end: projectPoint(coeffs, 1, position),
    },
  ]);
}

// Builds overlay geometry from four board corners.
export function buildOverlayGeometry(corners: Point[]): OverlayGeometry | null {
  if (corners.length !== 4) return null;
  try {
    const coeffs = quadrilateralTransform(corners);
    return {
      outline: polygon(coeffs, { left: 0, top: 0, right: 1, bottom: 1 }),
      lines: gridLines(coeffs),
      cells: Array.from({ length: 9 }, (_cellValue, index) => cellGeometry(coeffs, index)),
    };
  } catch {
    return null;
  }
}
