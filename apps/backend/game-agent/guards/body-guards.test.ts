import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { isBoard } from "./body-guards";
import { isJpegImage } from "./body-guards";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";

describe("isJpegImage", () => {
  it("accepts a JPEG data URL", () => {
    expect(isJpegImage(JPEG)).toBe(true);
  });

  it("rejects a missing image or a non-JPEG", () => {
    expect(isJpegImage("data:image/png;base64,xx")).toBe(false);
    expect(isJpegImage(1)).toBe(false);
  });
});

describe("isBoard", () => {
  it("accepts nine X, O, or empty cells", () => {
    expect(isBoard(Array(9).fill(null))).toBe(true);
    expect(isBoard(["X", "O", null, null, null, null, null, null, null])).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isBoard(null)).toBe(false);
    expect(isBoard(["X"])).toBe(false);
    expect(isBoard(["Z", ...Array(8).fill(null)])).toBe(false);
    expect(isBoard(".........")).toBe(false);
  });
});
