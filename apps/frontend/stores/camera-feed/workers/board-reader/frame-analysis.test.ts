import { describe, expect, it } from "vitest";
import { describeQuality } from "./frame-analysis";

const paper = [200, 200, 200, 200, 200, 200, 200, 200, 200];
const cells = Array.from({ length: 9 }, () => ({
  mark: null,
  confidence: 0.99,
  ink: 0.01,
}));

describe("describeQuality", () => {
  it("calls a lost grid misaligned", () => {
    expect(
      describeQuality(true, false, paper, 0, paper, 1, 0, 1000, cells).quality,
    ).toBe("misaligned");
  });

  it("calls a dim page dark", () => {
    expect(
      describeQuality(
        false,
        true,
        [40, 40, 40, 40, 40, 40, 40, 40, 40],
        0,
        paper,
        1,
        0,
        1000,
        cells,
      ).quality,
    ).toBe("dark");
  });

  it("waits when the page is moving", () => {
    expect(
      describeQuality(false, true, paper, 0.05, paper, 1, 0, 1000, cells)
        .quality,
    ).toBe("moving");
  });

  it("treats a covered or inky board as occluded", () => {
    expect(
      describeQuality(
        false,
        true,
        paper,
        0,
        [0.5, 1, 1, 1, 1, 1, 1, 1, 1],
        1,
        0,
        1000,
        cells,
      ).quality,
    ).toBe("occluded");
    expect(
      describeQuality(false, true, paper, 0, paper, 1, 300, 1000, cells)
        .quality,
    ).toBe("occluded");
  });

  it("is good when the page is still, and mentions an unclear square", () => {
    expect(
      describeQuality(false, true, paper, 0, paper, 1, 0, 1000, cells),
    ).toMatchObject({ quality: "good", message: "Board is clear and steady." });
    const unclear = [
      { mark: "?" as const, confidence: 0.99, ink: 0.01 },
      ...cells.slice(1),
    ];
    expect(
      describeQuality(false, true, paper, 0, paper, 1, 0, 1000, unclear)
        .message,
    ).toMatch(/unclear/);
  });
});
