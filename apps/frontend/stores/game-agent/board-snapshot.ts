import { projectUv } from "../../lib/board-geometry/board-geometry";
import { quadrilateralTransform } from "../../lib/board-geometry/board-geometry";
import { components } from "../camera-feed/workers/board-reader/ink-components";
import { paperLevels } from "../camera-feed/workers/board-reader/board-image";
import { luma } from "../camera-feed/workers/board-reader/board-image";
import { cleanPaperImage } from "../../lib/paper-image/paper-image";
import type { Board } from "../../types";
import type { Point } from "../../types";

export type BoardSnapshot = {
  image: string;
  ink: number[];
};
// Warps the camera frame into a board snapshot.
export function captureBoard(source: HTMLCanvasElement, corners: Point[]): BoardSnapshot {
  if (corners.length !== 4) throw new Error("Show the whole board first.");
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The camera frame is unavailable.");
  const input = context.getImageData(0, 0, source.width, source.height);
  const size = 288;
  const gray = new Float32Array(size * size);
  const transform = quadrilateralTransform(corners);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [u, v] = projectUv(transform, (x + 0.5) / size, (y + 0.5) / size);
      const sx = Math.min(source.width - 1, Math.max(0, Math.round(u * source.width)));
      const sy = Math.min(source.height - 1, Math.max(0, Math.round(v * source.height)));
      gray[y * size + x] = luma(input.data, (sy * source.width + sx) * 4);
    }
  let image: string | undefined;
  return {
    get image() {
      return (image ??= encodeBoard(cleanPaperImage(gray, size, size).pixels, size));
    },
    ink: boardInk(gray, size),
  };
}

function encodeBoard(gray: Float32Array, size: number): string {
  const target = document.createElement("canvas");
  target.width = target.height = size;
  const output = target.getContext("2d")!;
  const data = output.createImageData(size, size);
  for (let at = 0; at < gray.length; at++) {
    data.data[at * 4] = data.data[at * 4 + 1] = data.data[at * 4 + 2] = gray[at];
    data.data[at * 4 + 3] = 255;
  }
  output.putImageData(data, 0, 0);
  return target.toDataURL("image/jpeg", 0.85);
}

// Measures ink in each square.
export function boardInk(gray: Float32Array, size: number): number[] {
  const paper = paperLevels(gray, size);
  const cellSize = size / 3;
  const margin = Math.round(cellSize / 8);
  return paper.map((level, cell) => {
    const innerSize = cellSize - 2 * margin;
    const mask = new Uint8Array(innerSize ** 2);
    const left = (cell % 3) * cellSize;
    const top = Math.floor(cell / 3) * cellSize;
    for (let y = margin; y < cellSize - margin; y++) for (let x = margin; x < cellSize - margin; x++) mask[(y - margin) * innerSize + x - margin] = Number(gray[(top + y) * size + left + x] < level * 0.82);
    return (
      components(mask, innerSize)
        .filter((group) => Math.min(group.maxX - group.minX, group.maxY - group.minY) >= innerSize * 0.12 && Math.max(group.maxX - group.minX, group.maxY - group.minY) >= innerSize * 0.2)
        .reduce((total, group) => total + group.points.length, 0) /
      innerSize ** 2
    );
  });
}

// True when an empty square gained new ink.
export function inkChanged(current: number[], previous: number[], saved?: Board): boolean {
  return current.some((ink, cell) => !saved?.[cell] && Math.abs(ink - previous[cell]) > Math.max(0.006, previous[cell] * 0.4));
}
