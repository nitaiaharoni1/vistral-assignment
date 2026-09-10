import { projectUv, quadrilateralTransform } from "../../lib/board-geometry";
import { components } from "../camera-feed/workers/board-reader/ink-components";
import { paperLevels } from "../camera-feed/workers/board-reader/board-image";
import type { Board, Point } from "../../types";

export type BoardSnapshot = {
  image: string;
  ink: number[];
};
export function captureBoard(
  source: HTMLCanvasElement,
  corners: Point[],
): BoardSnapshot {
  if (corners.length !== 4) throw new Error("Show the whole board first.");
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The camera frame is unavailable.");
  const input = context.getImageData(0, 0, source.width, source.height);
  const size = 384;
  const target = document.createElement("canvas");
  target.width = target.height = size;
  const output = target.getContext("2d")!;
  const data = output.createImageData(size, size);
  const gray = new Float32Array(size * size);
  const transform = quadrilateralTransform(corners);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [u, v] = projectUv(transform, (x + 0.5) / size, (y + 0.5) / size);
      const sx = Math.min(
        source.width - 1,
        Math.max(0, Math.round(u * source.width)),
      );
      const sy = Math.min(
        source.height - 1,
        Math.max(0, Math.round(v * source.height)),
      );
      const at = (y * size + x) * 4,
        from = (sy * source.width + sx) * 4;
      data.data[at] = input.data[from];
      data.data[at + 1] = input.data[from + 1];
      data.data[at + 2] = input.data[from + 2];
      data.data[at + 3] = 255;
      gray[y * size + x] =
        input.data[from] * 0.299 +
        input.data[from + 1] * 0.587 +
        input.data[from + 2] * 0.114;
    }
  output.putImageData(data, 0, 0);
  return {
    image: target.toDataURL("image/jpeg", 0.85),
    ink: boardInk(gray, size),
  };
}

export function boardInk(gray: Float32Array, size: number): number[] {
  const paper = paperLevels(gray, size);
  const cellSize = size / 3;
  const margin = Math.round(cellSize / 8);
  return paper.map((level, cell) => {
    const innerSize = cellSize - 2 * margin;
    const mask = new Uint8Array(innerSize ** 2);
    const left = (cell % 3) * cellSize;
    const top = Math.floor(cell / 3) * cellSize;
    for (let y = margin; y < cellSize - margin; y++)
      for (let x = margin; x < cellSize - margin; x++)
        mask[(y - margin) * innerSize + x - margin] = Number(
          gray[(top + y) * size + left + x] < level * 0.82,
        );
    return (
      components(mask, innerSize)
        .filter(
          (group) =>
            Math.min(group.maxX - group.minX, group.maxY - group.minY) >=
              innerSize * 0.12 &&
            Math.max(group.maxX - group.minX, group.maxY - group.minY) >=
              innerSize * 0.2,
        )
        .reduce((total, group) => total + group.points.length, 0) /
      innerSize ** 2
    );
  });
}

export function inkChanged(
  current: number[],
  previous: number[],
  saved?: Board,
): boolean {
  return current.some(
    (ink, cell) =>
      !saved?.[cell] &&
      Math.abs(ink - previous[cell]) > Math.max(0.006, previous[cell] * 0.4),
  );
}
