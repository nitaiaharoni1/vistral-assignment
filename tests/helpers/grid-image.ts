import type { Corners } from "../../shared/types";

export const GRID_CORNERS: Corners = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 },
];

export function grayImage(width: number, height: number, value = 220): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

export function ruledGridImage(size = 360): ImageData {
  const image = grayImage(size, size, 230);
  const inset = Math.round(size * 0.12);
  const inner = size - inset * 2;
  const lines = [0, inner / 3, (2 * inner) / 3, inner];
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const at = (y * size + x) * 4;
    image.data[at] = image.data[at + 1] = image.data[at + 2] = 12;
  };
  for (const line of lines) {
    const axis = inset + Math.round(line);
    for (let y = inset; y < size - inset; y++) ink(axis, y);
    for (let x = inset; x < size - inset; x++) ink(x, axis);
  }
  return image;
}
