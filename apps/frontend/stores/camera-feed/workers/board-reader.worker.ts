import type { WorkerMessage, WorkerReply } from "../../../types";
import {
  createCalibration,
  type Calibration,
} from "./board-reader/calibration";
import { detectBoard } from "./board-reader/grid-detection";
import { analyzeFrame } from "./board-reader/frame-analysis";

declare const self: DedicatedWorkerGlobalScope;

let calibration: Calibration | null = null;

function reply(message: WorkerReply) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const request = event.data;
  try {
    if (request.type === "detect" || request.type === "calibrate") {
      calibration = null;
      const corners =
        request.type === "detect"
          ? detectBoard(request.image)
          : request.corners;
      if (!corners) {
        reply({ type: "detected", id: request.id, corners: null });
        return;
      }
      calibration = createCalibration(request.image, corners, "existing");
      reply({
        type: request.type === "detect" ? "detected" : "calibrated",
        id: request.id,
        corners,
        board: calibration.initialBoard.map((mark) =>
          mark === "?" ? null : mark,
        ),
      });
    } else if (request.type === "frame") {
      if (!calibration)
        throw new Error("Calibrate an empty board before starting a game.");
      reply({
        type: "observation",
        observation: analyzeFrame(
          request.image,
          calibration,
          request.timestamp,
          request.board,
        ),
        id: request.id,
      });
    }
  } catch (error) {
    reply({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "The camera picture could not be read. Try calibrating again.",
      id: request.id,
    });
  }
});
