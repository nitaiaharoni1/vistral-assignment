import { segmentedRing } from "../../../../lib/segmented-ring";
import {
  quadrilateralTransform,
  projectUv,
} from "../../../../lib/board-geometry";
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

function projectPoint(coeffs: number[], u: number, v: number): OverlayPoint {
  const [x, y] = projectUv(coeffs, u, v);
  return { x: x * 1000, y: y * 1000 };
}

function polygon(
  coeffs: number[],
  left: number,
  top: number,
  right: number,
  bottom: number,
): string {
  return [
    projectPoint(coeffs, left, top),
    projectPoint(coeffs, right, top),
    projectPoint(coeffs, right, bottom),
    projectPoint(coeffs, left, bottom),
  ]
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
}

function cellRing(coeffs: number[], left: number, top: number): string {
  return Array.from({ length: 32 }, (_ringValue, step) => {
    const angle = (step * Math.PI * 2) / 32;
    const { x, y } = projectPoint(
      coeffs,
      left + 1 / 6 + Math.cos(angle) * 0.085,
      top + 1 / 6 + Math.sin(angle) * 0.085,
    );
    return `${x},${y}`;
  }).join(" ");
}

function cellGeometry(coeffs: number[], index: number): OverlayCellGeometry {
  const left = (index % 3) / 3;
  const top = Math.floor(index / 3) / 3;
  return {
    outline: polygon(
      coeffs,
      left + 0.025,
      top + 0.025,
      left + 1 / 3 - 0.025,
      top + 1 / 3 - 0.025,
    ),
    label: projectPoint(coeffs, left + 0.035, top + 0.035),
    center: projectPoint(coeffs, left + 1 / 6, top + 1 / 6),
    cross: [
      [
        projectPoint(coeffs, left + 0.1, top + 0.1),
        projectPoint(coeffs, left + 0.23, top + 0.23),
      ],
      [
        projectPoint(coeffs, left + 0.23, top + 0.1),
        projectPoint(coeffs, left + 0.1, top + 0.23),
      ],
    ],
    ring: cellRing(coeffs, left, top),
    ringGuide: segmentedRing((x, y) => {
      const point = projectPoint(
        coeffs,
        left + 1 / 6 + x * 0.085,
        top + 1 / 6 + y * 0.085,
      );
      return [point.x, point.y];
    }),
  };
}

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

export function buildOverlayGeometry(corners: Point[]): OverlayGeometry | null {
  if (corners.length !== 4) return null;
  try {
    const coeffs = quadrilateralTransform(corners);
    return {
      outline: polygon(coeffs, 0, 0, 1, 1),
      lines: gridLines(coeffs),
      cells: Array.from({ length: 9 }, (_cellValue, index) =>
        cellGeometry(coeffs, index),
      ),
    };
  } catch {
    return null;
  }
}
