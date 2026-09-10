import { getOutcome } from "@shared/board.helpers";
import {
  hasPendingMove,
  isUnexpectedMark,
  MAX_CELL_READING_GAP_MS,
  MIN_CHECKING_INK,
} from "@shared/session.helpers";
import type {
  CellReading,
  Mark,
  Observation,
  Outcome,
  Session,
  Stage,
} from "../../../../types";
import { CELL_NAMES, drawOInstruction, isInGame } from "../../../../types";
import type {
  OverlayGeometry,
  OverlayPoint,
} from "./detection-overlay-geometry";

export type OverlayCellState =
  "rejected" | "confirmed" | "detected" | "pending" | "candidate" | "empty";

export type OverlayCell = {
  mark: Mark;
  state: OverlayCellState;
  status: string;
  checking: boolean;
};

export type OverlayGameSnapshot = {
  usesRemoteAgent?: boolean;
  stage: Stage;
  error: string;
  session: Session;
  observation: Observation | null;
  detectedBoard: Mark[] | null;
};

export type OverlayView = {
  verified: boolean;
  cells: OverlayCell[];
  targetHint: string | null;
  outcome: ReturnType<typeof getOutcome> | null;
  first: OverlayPoint | null;
  last: OverlayPoint | null;
  label: string;
};

function cellCandidate(reading: CellReading | null): "X" | "O" | null {
  if (reading?.readable === false) return null;
  if (reading?.mark === "X" || reading?.mark === "O") return reading.mark;
  return null;
}

function cellStatus(state: OverlayCellState): string {
  if (state === "rejected") return "Not accepted";
  if (state === "confirmed") return "Confirmed";
  if (state === "detected") return "Detected; waiting to verify the turn";
  if (state === "pending") return "Draw next";
  if (state === "candidate") return "Checking";
  return "Empty";
}

function isCheckingCell(reading: CellReading | null, candidate: Mark): boolean {
  return (
    candidate !== null ||
    (reading?.mark === "?" && reading.ink > MIN_CHECKING_INK)
  );
}

function retainedCandidate(
  game: OverlayGameSnapshot,
  reading: CellReading | null,
  index: number,
): Mark {
  const retained = game.session.cellCandidates[index];
  const recent =
    isInGame(game.stage) &&
    !game.session.paused &&
    game.observation &&
    retained &&
    game.observation.timestamp - retained.lastSeen <= MAX_CELL_READING_GAP_MS;
  return cellCandidate(reading) ?? (recent ? retained.mark : null);
}

function cellVisualState(
  saved: Mark,
  recognized: Mark,
  rejected: boolean,
  suggested: boolean,
  mark: Mark,
  inspecting: boolean,
  stage: Stage,
): OverlayCellState {
  if (saved && isInGame(stage)) return "confirmed";
  if (rejected) return "rejected";
  if (recognized) return "detected";
  if (suggested) return "pending";
  return mark || inspecting ? "candidate" : "empty";
}

function cellInspection(
  game: OverlayGameSnapshot,
  index: number,
  detected: Mark,
  reading: CellReading | null,
  candidate: Mark,
) {
  if (game.usesRemoteAgent) return { checking: false, inspecting: false };
  const active = isInGame(game.stage) && !game.session.paused;
  const started = game.session.cellReadingStartedAt[index];
  const elapsed = (game.observation?.timestamp ?? 0) - (started ?? 0);
  const timedOut = active && !detected && started !== null && elapsed >= 3000;
  const inspecting = !timedOut && isCheckingCell(reading, candidate);
  const checking = active && !detected && inspecting;
  return { checking, inspecting };
}

function overlayCellAt(
  game: OverlayGameSnapshot,
  saved: Mark,
  index: number,
  readable: boolean,
  canSuggest: boolean,
): OverlayCell {
  const reading = readable ? game.observation!.cells[index] : null;
  const candidate = retainedCandidate(game, reading, index);
  const recognized = isInGame(game.stage)
    ? game.session.recognizedBoard[index]
    : null;
  const detected = saved ?? recognized;
  const suggested =
    canSuggest && game.session.pendingMove === index && !detected;
  const rejected =
    !!recognized && !saved && isUnexpectedMark(game.session, recognized, index);
  const { checking, inspecting } = cellInspection(
    game,
    index,
    detected,
    reading,
    candidate,
  );
  const mark = detected ?? (suggested ? "O" : checking ? candidate : null);
  const state = cellVisualState(
    saved,
    recognized,
    rejected,
    suggested,
    mark,
    inspecting,
    game.stage,
  );
  return {
    mark,
    state,
    checking,
    status: checking ? "Checking mark" : cellStatus(state),
  };
}

export function isOverlayReadable(game: OverlayGameSnapshot): boolean {
  if (!isInGame(game.stage) || game.session.paused || !game.observation) {
    return false;
  }
  if (game.observation.quality === "dark") return false;
  if (game.observation.quality === "misaligned") return false;
  return game.observation.cells.length === 9;
}

function buildOverlayCells(
  game: OverlayGameSnapshot,
  readable: boolean,
  canSuggest: boolean,
): OverlayCell[] {
  const board = isInGame(game.stage)
    ? game.session.board
    : (game.detectedBoard ?? Array(9).fill(null));
  return board.map((saved, index) =>
    overlayCellAt(game, saved, index, readable, canSuggest),
  );
}

function overlayLabel(input: {
  stage: Stage;
  error: string;
  outcome: Outcome;
  savedCount: number;
  hasRejected: boolean;
  verified: boolean;
}): string {
  if (!isInGame(input.stage)) {
    return input.error
      ? "Check the outline, then detect again"
      : "Reading all nine squares…";
  }
  if (input.outcome === "draw") return "Draw · all squares confirmed";
  if (input.outcome)
    return `${input.outcome} wins · ${input.savedCount} confirmed`;
  if (input.hasRejected) {
    return `${input.savedCount}/9 detected · check the move`;
  }
  const watch = input.verified ? "watching" : "checking the paper";
  return `${input.savedCount}/9 detected · ${watch}`;
}

export function overlayAriaLabel(
  label: string,
  cells: OverlayCell[],
  targetHint: string | null,
): string {
  const details = cells
    .map(
      (cell, index) =>
        `${CELL_NAMES[index]}: ${cell.mark ?? (cell.checking ? "unconfirmed mark" : "empty")}, ${cell.status}`,
    )
    .join(", ");
  const hint = targetHint
    ? `. ${targetHint} Dashed marks are not confirmed.`
    : "";
  return `${label}. ${details}${hint}`;
}

export function buildOverlayView(
  game: OverlayGameSnapshot,
  geometry: OverlayGeometry,
): OverlayView {
  const readable = isOverlayReadable(game);
  const verified = readable && game.session.pageMatchesBoard;
  const canSuggest =
    isInGame(game.stage) &&
    !game.session.paused &&
    hasPendingMove(game.session);
  const cells = buildOverlayCells(game, readable, canSuggest);
  const targetHint =
    canSuggest && game.session.pendingMove !== null
      ? game.session.recognizedBoard[game.session.pendingMove] === "O"
        ? "O detected · checking the turn"
        : drawOInstruction(game.session.pendingMove)
      : null;
  const savedCount = game.session.recognizedBoard.filter(Boolean).length;
  const outcome =
    isInGame(game.stage) && game.session.phase === "finished"
      ? getOutcome(game.session.board)
      : null;
  const winningLine = outcome?.winningLine;
  const first = winningLine ? geometry.cells[winningLine[0]].center : null;
  const last = winningLine ? geometry.cells[winningLine[2]].center : null;
  return {
    verified,
    cells,
    targetHint,
    outcome,
    first,
    last,
    label: overlayLabel({
      stage: game.stage,
      error: game.error,
      outcome: outcome?.outcome ?? null,
      savedCount,
      hasRejected: cells.some((cell) => cell.state === "rejected"),
      verified,
    }),
  };
}

export function boardAnalysisLabel(
  game: OverlayGameSnapshot,
  hasGeometry = false,
): string | null {
  if (game.session.paused || game.error) return null;
  if (isInGame(game.stage) && hasGeometry) return null;
  if (game.stage === "detecting") return "Finding the board…";
  if (game.stage === "calibrating") return "Checking the board…";
  if (isInGame(game.stage) && game.session.phase !== "finished")
    return "Finding the board…";
  return null;
}
