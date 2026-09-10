import type { Board, Outcome } from "./board";

export type SessionEvent = {
  id: string;
  at: number;
  kind: string;
  message: string;
  cell?: number;
  mark?: "X" | "O";
  board?: Board;
};

export type CellCandidate = {
  mark: "X" | "O" | null;
  frames: number;
  since: number;
  lastSeen: number;
};

export type Session = {
  mode: "play" | "replay";
  board: Board;
  recognizedBoard: Board;
  cellReadingStartedAt: (number | null)[];
  phase: "human" | "draw-ai" | "finished";
  pendingMove: number | null;
  outcome: Outcome;
  winningLine: number[] | null;
  message: string;
  events: SessionEvent[];
  stableFrames: number;
  stableSince: number | null;
  candidateKey: string | null;
  candidateSeenAt: number | null;
  cellCandidates: (CellCandidate | null)[];
  lastObservationAt: number | null;
  paused: boolean;
  recoveryReason: string | null;
  checkingChange: boolean;
  boardCheck: "ready" | "interrupted" | "finding-grid" | "verifying-grid";
  pageMatchesBoard: boolean;
};
