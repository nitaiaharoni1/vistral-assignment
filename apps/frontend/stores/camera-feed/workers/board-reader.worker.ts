import type { WorkerMessage } from "../../../types";
import type { WorkerReply } from "../../../types";
import { createCalibration } from "./board-reader/calibration";
import type { Calibration } from "./board-reader/calibration";
import { detectBoard } from "./board-reader/grid-detection";
import { analyzeFrame } from "./board-reader/frame-analysis";

let calibration: Calibration | null = null;

// Clears the worker's saved calibration.
export function resetBoardReaderCalibration() {
  calibration = null;
}

// Handles a worker request and turns errors into replies.
export function handleWorkerRequest(request: WorkerMessage): WorkerReply {
  try {
    return processRequest(request);
  } catch (error) {
    return {
      type: "error",
      message: error instanceof Error ? error.message : "The camera picture could not be read. Try calibrating again.",
      id: request.id,
    };
  }
}

// Routes a detect, calibrate, or frame request.
function processRequest(request: WorkerMessage): WorkerReply {
  switch (request.type) {
    case "detect":
    case "calibrate":
      return openBoard(request);
    case "frame":
      return readFrame(request);
    default: {
      const unexpected: never = request;
      return unexpected;
    }
  }
}

// Finds or calibrates a board from the current image.
function openBoard(request: Extract<WorkerMessage, { type: "detect" | "calibrate" }>): WorkerReply {
  calibration = null;
  const corners = request.type === "detect" ? detectBoard(request.image) : request.corners;
  if (!corners) return { type: "detected", id: request.id, corners: null };
  calibration = createCalibration(request.image, corners, "existing");
  return {
    type: request.type === "detect" ? "detected" : "calibrated",
    id: request.id,
    corners,
    board: calibration.initialBoard.map((mark) => (mark === "?" ? null : mark)),
  };
}

// Reads marks from a live calibrated frame.
function readFrame(request: Extract<WorkerMessage, { type: "frame" }>): WorkerReply {
  if (!calibration) throw new Error("Calibrate an empty board before starting a game.");
  return {
    type: "observation",
    observation: analyzeFrame({
      image: request.image,
      calibration,
      timestamp: request.timestamp,
      confirmedBoard: request.board,
    }),
    id: request.id,
  };
}

// Listens for messages when running as a dedicated worker.
function bindDedicatedWorker() {
  if (!isDedicatedWorker()) return;
  self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    self.postMessage(handleWorkerRequest(event.data));
  });
}

// True when this script is running as a dedicated worker.
function isDedicatedWorker() {
  return typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
}

declare const self: DedicatedWorkerGlobalScope;

bindDedicatedWorker();
