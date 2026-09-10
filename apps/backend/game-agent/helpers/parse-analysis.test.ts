import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { analysis } from "../../../../tests/helpers/boards.ts";
import { parseAnalysis } from "./parse-analysis";

describe("parseAnalysis", () => {
  it("accepts a complete nine-cell reading", () => {
    expect(parseAnalysis(analysis("....X...."))).toEqual(analysis("....X...."));
  });

  it("rejects missing fields, extra fields, and bad cells", () => {
    expect(() => parseAnalysis(null)).toThrow(/Invalid model response/);
    expect(() => parseAnalysis({ ...analysis("........."), extra: 1 })).toThrow(/Invalid model response/);
    expect(() => parseAnalysis({ ...analysis("........."), suggestedMove: 0 })).toThrow(/Invalid model response/);
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
