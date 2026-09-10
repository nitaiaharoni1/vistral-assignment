export type Mark = "X" | "O" | null;
export type Board = Mark[];
export type Outcome = "X" | "O" | "draw" | null;
export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type CellReading = {
  mark: Mark | "?";
  confidence: number;
  ink: number;
  readable?: boolean;
  imageReadable?: boolean;
};
export type Observation = {
  cells: CellReading[];
  timestamp: number;
  processingMs: number;
  corners?: Corners;
  reacquired?: boolean;
  motion: number;
  quality: "good" | "moving" | "dark" | "occluded" | "misaligned";
  message: string;
};
export const CELL_NAMES = [
  "top left",
  "top center",
  "top right",
  "middle left",
  "center",
  "middle right",
  "bottom left",
  "bottom center",
  "bottom right",
];
export const CELL_IDS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];

export function drawOInstruction(cell: number): string {
  return `Draw O in the ${CELL_NAMES[cell]}.`;
}
