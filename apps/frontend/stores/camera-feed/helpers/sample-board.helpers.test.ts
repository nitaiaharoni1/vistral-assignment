import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { drawSample } from "./sample-board.helpers";
import { SAMPLE_CORNERS } from "./sample-board.helpers";

describe("drawSample", () => {
  it("keeps the sample board in the center of the frame", () => {
    expect(SAMPLE_CORNERS).toHaveLength(4);
    expect(SAMPLE_CORNERS[0].x).toBeCloseTo(0.3);
  });

  it("draws marks when the canvas can be read", () => {
    const canvas = document.createElement("canvas");
    const context = {
      save() {},
      restore() {},
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      fillText() {},
      translate() {},
      rotate() {},
      ellipse() {},
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetY: 0,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      font: "",
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    drawSample(canvas, ["X", null, null, null, "O", null, null, null, "X"], true);
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(720);
  });

  it("fails when the canvas cannot be read", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(() => drawSample(canvas, Array(9).fill(null))).toThrow(/cannot read the video canvas/);
  });
});
