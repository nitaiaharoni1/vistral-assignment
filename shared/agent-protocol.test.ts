import { describe, expect, it } from "vitest";
import { isBoard, parseAnalysis } from "./agent-protocol";
import { analysis } from "../tests/helpers/boards.ts";

describe("isBoard", () => {
  it("accepts nine X, O, or empty cells", () => {
    expect(isBoard(Array(9).fill(null))).toBe(true);
    expect(isBoard(["X", "O", null, null, null, null, null, null, null])).toBe(
      true,
    );
  });

  it("rejects anything else", () => {
    expect(isBoard(null)).toBe(false);
    expect(isBoard(["X"])).toBe(false);
    expect(isBoard(["Z", ...Array(8).fill(null)])).toBe(false);
    expect(isBoard(".........")).toBe(false);
  });
});

describe("parseAnalysis", () => {
  it("accepts a complete nine-cell reading", () => {
    expect(parseAnalysis(analysis("....X...."))).toEqual(analysis("....X...."));
  });

  it("rejects missing fields, extra fields, and bad cells", () => {
    expect(() => parseAnalysis(null)).toThrow(/Invalid model response/);
    expect(() => parseAnalysis({ ...analysis("........."), extra: 1 })).toThrow(
      /Invalid model response/,
    );
    expect(() =>
      parseAnalysis({ ...analysis("........."), suggestedMove: 0 }),
    ).toThrow(/Invalid model response/);
    expect(() =>
      parseAnalysis({
        ...analysis("........."),
        cells: analysis(".........").cells.map((cell) => ({
          mark: cell.mark,
          confidence: 1.2,
        })),
      }),
    ).toThrow(/Invalid model response/);
    expect(() =>
      parseAnalysis({
        ...analysis("........."),
        reason: "x".repeat(241),
      }),
    ).toThrow(/Invalid model response/);
  });

  it("accepts unknown cells and a blank board", () => {
    expect(parseAnalysis(analysis("????.....")).cells[0].mark).toBe("unknown");
    expect(parseAnalysis(analysis(".........")).clear).toBe(true);
  });
});
