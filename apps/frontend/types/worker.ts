import type { Board } from "@shared/types";
import type { Corners } from "@shared/types";
import type { Observation } from "@shared/types";

export type WorkerRequest = { type: "detect"; image: ImageData } | { type: "calibrate"; image: ImageData; corners: Corners } | { type: "frame"; image: ImageData; timestamp: number; board?: Board };

export type WorkerMessage = WorkerRequest & { id: number };

export type WorkerReply =
  | { type: "detected"; id: number; corners: null }
  | {
      type: "detected" | "calibrated";
      id: number;
      corners: Corners;
      board: Board;
    }
  | { type: "observation"; id: number; observation: Observation }
  | { type: "error"; id: number; message: string };
