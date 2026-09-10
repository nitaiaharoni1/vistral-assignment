import type { Board } from "../../../../shared/types";

export const MAX_IMAGE_CHARS = 800000;
const JPEG = /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/;

// True when the value is a JPEG data URL that fits the size cap.
export function isJpegImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_IMAGE_CHARS && JPEG.test(value);
}

// True when the value is a nine-square X, O, or empty board.
export function isBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length === 9 && value.every((mark) => mark === null || mark === "X" || mark === "O");
}
