import type { Point } from "../../types";

// Builds the map that stretches a unit square onto four board corners.
export function quadrilateralTransform(points: Point[]): number[] {
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const equations: number[][] = [];
  points.forEach(({ x, y }, index) => {
    const [u, v] = square[index];
    equations.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    equations.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  });
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(equations[row][column]) > Math.abs(equations[pivot][column])) pivot = row;
    }
    [equations[column], equations[pivot]] = [equations[pivot], equations[column]];
    const divisor = equations[column][column];
    if (Math.abs(divisor) < 1e-8) throw new Error("Spread the four corners around the whole board and try again.");
    for (let index = column; index < 9; index++) equations[column][index] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = equations[row][column];
      for (let index = column; index < 9; index++) equations[row][index] -= factor * equations[column][index];
    }
  }
  return [...equations.map((row) => row[8]), 1];
}

// Projects a unit-square point through that map into image pixels.
export function projectUv(transform: number[], u: number, v: number): number[] {
  const w = transform[6] * u + transform[7] * v + 1;
  return [(transform[0] * u + transform[1] * v + transform[2]) / w, (transform[3] * u + transform[4] * v + transform[5]) / w];
}
