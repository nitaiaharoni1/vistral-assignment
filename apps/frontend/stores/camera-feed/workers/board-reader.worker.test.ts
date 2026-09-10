import { beforeEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { grayImage } from "../../../../../tests/helpers/grid-image.ts";
import { GRID_CORNERS } from "../../../../../tests/helpers/grid-image.ts";
import { ruledGridImage } from "../../../../../tests/helpers/grid-image.ts";
import { handleWorkerRequest } from "./board-reader.worker";
import { resetBoardReaderCalibration } from "./board-reader.worker";

describe("handleWorkerRequest", () => {
  beforeEach(() => {
    resetBoardReaderCalibration();
  });

  it("reports no corners on a blank page", () => {
    const reply = handleWorkerRequest({
      type: "detect",
      id: 1,
      image: grayImage(220, 220),
    });
    expect(reply).toEqual({ type: "detected", id: 1, corners: null });
  });

  it("calibrates a ruled grid or explains why it cannot", () => {
    const image = ruledGridImage();
    const reply = handleWorkerRequest({
      type: "calibrate",
      id: 2,
      image,
      corners: GRID_CORNERS,
    });
    if (reply.type === "error") {
      expect(reply.message).toMatch(/grid lines|empty squares|too dark|not ready/);
      return;
    }
    expect(reply).toMatchObject({ type: "calibrated", id: 2 });
    if (reply.type !== "calibrated") return;
    expect(reply.corners).toEqual(GRID_CORNERS);
    expect(reply.board).toHaveLength(9);
    const frame = handleWorkerRequest({
      type: "frame",
      id: 3,
      image,
      timestamp: 20,
      board: reply.board,
    });
    expect(frame.type === "observation" || frame.type === "error").toBe(true);
  });

  it("refuses a live frame before calibration", () => {
    const reply = handleWorkerRequest({
      type: "frame",
      id: 4,
      image: grayImage(200, 200),
      timestamp: 1,
    });
    expect(reply).toMatchObject({
      type: "error",
      id: 4,
      message: expect.stringMatching(/Calibrate an empty board/),
    });
  });
});
