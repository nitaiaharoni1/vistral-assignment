import { getOutcome } from "@shared/board-helpers/board.helpers";
import { hasPendingMove } from "@shared/session-helpers/session.helpers";
import { isUnexpectedMark } from "@shared/session-helpers/session.helpers";
import { MAX_CELL_READING_GAP_MS } from "@shared/session-helpers/session.helpers";
import { MIN_CHECKING_INK } from "@shared/session-helpers/session.helpers";
import type { CellReading } from "../../../../types";
import type { Mark } from "../../../../types";
import type { Observation } from "../../../../types";
import type { Outcome } from "../../../../types";
import type { Session } from "../../../../types";
import type { Stage } from "../../../../types";
import { CELL_NAMES } from "../../../../types";
import { drawOInstruction } from "../../../../types";
import { isInGame } from "../../../../types";
import type { OverlayGeometry } from "./detection-overlay-geometry";
import type { OverlayPoint } from "./detection-overlay-geometry";

export type OverlayCellState = "rejected" | "confirmed" | "detected" | "pending" | "candidate" | "empty";

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

// Returns X or O from a readable cell reading, else null.
function cellCandidate(reading: CellReading | null): "X" | "O" | null {
  if (reading?.readable === false) return null;
  if (reading?.mark === "X" || reading?.mark === "O") return reading.mark;
  return null;
}

// Returns the short status phrase for a cell state.
function cellStatus(state: OverlayCellState): string {
  if (state === "rejected") return "Not accepted";
  if (state === "confirmed") return "Confirmed";
  if (state === "detected") return "Detected; waiting to verify the turn";
  if (state === "pending") return "Draw next";
  if (state === "candidate") return "Checking";
  return "Empty";
}

// True when a reading still looks like an unconfirmed mark.
function isCheckingCell(reading: CellReading | null, candidate: Mark): boolean {
  return candidate !== null || (reading?.mark === "?" && reading.ink > MIN_CHECKING_INK);
}

// Keeps a recent candidate if the live reading is gone.
function retainedCandidate(game: OverlayGameSnapshot, reading: CellReading | null, index: number): Mark {
  const retained = game.session.cellCandidates[index];
  const recent = isInGame(game.stage) && !game.session.paused && game.observation && retained && game.observation.timestamp - retained.lastSeen <= MAX_CELL_READING_GAP_MS;
  return cellCandidate(reading) ?? (recent ? retained.mark : null);
}

// Picks the overlay state from saved, recognized, and draft marks.
function cellVisualState(input: { saved: Mark; recognized: Mark; rejected: boolean; suggested: boolean; mark: Mark; inspecting: boolean; stage: Stage }): OverlayCellState {
  if (input.saved && isInGame(input.stage)) return "confirmed";
  if (input.rejected) return "rejected";
  if (input.recognized) return "detected";
  if (input.suggested) return "pending";
  return input.mark || input.inspecting ? "candidate" : "empty";
}

// Decides if a local cell is still being checked.
function cellInspection(input: { game: OverlayGameSnapshot; index: number; detected: Mark; reading: CellReading | null; candidate: Mark }) {
  if (input.game.usesRemoteAgent) return { checking: false, inspecting: false };
  const active = isInGame(input.game.stage) && !input.game.session.paused;
  const started = input.game.session.cellReadingStartedAt[input.index];
  const elapsed = (input.game.observation?.timestamp ?? 0) - (started ?? 0);
  const timedOut = active && !input.detected && started !== null && elapsed >= 3000;
  const inspecting = !timedOut && isCheckingCell(input.reading, input.candidate);
  const checking = active && !input.detected && inspecting;
  return { checking, inspecting };
}

// Builds the overlay cell for one board square.
function overlayCellAt(input: { game: OverlayGameSnapshot; saved: Mark; index: number; readable: boolean; canSuggest: boolean }): OverlayCell {
  const reading = input.readable ? input.game.observation!.cells[input.index] : null;
  const candidate = retainedCandidate(input.game, reading, input.index);
  const recognized = isInGame(input.game.stage) ? input.game.session.recognizedBoard[input.index] : null;
  const detected = input.saved ?? recognized;
  const suggested = input.canSuggest && input.game.session.pendingMove === input.index && !detected;
  const rejected = !!recognized && !input.saved && isUnexpectedMark(input.game.session, recognized, input.index);
  const { checking, inspecting } = cellInspection({
    game: input.game,
    index: input.index,
    detected,
    reading,
    candidate,
  });
  const mark = detected ?? (suggested ? "O" : checking ? candidate : null);
  const state = cellVisualState({
    saved: input.saved,
    recognized,
    rejected,
    suggested,
    mark,
    inspecting,
    stage: input.game.stage,
  });
  return {
    mark,
    state,
    checking,
    status: checking ? "Checking mark" : cellStatus(state),
  };
}

// True when the live observation can drive the overlay.
export function isOverlayReadable(game: OverlayGameSnapshot): boolean {
  if (!isInGame(game.stage) || game.session.paused || !game.observation) {
    return false;
  }
  if (game.observation.quality === "dark") return false;
  if (game.observation.quality === "misaligned") return false;
  return game.observation.cells.length === 9;
}

// Builds overlay cells for all nine squares.
function buildOverlayCells(game: OverlayGameSnapshot, readable: boolean, canSuggest: boolean): OverlayCell[] {
  const board = isInGame(game.stage) ? game.session.board : (game.detectedBoard ?? Array(9).fill(null));
  return board.map((saved, index) => overlayCellAt({ game, saved, index, readable, canSuggest }));
}

// Writes the short board-status line for the overlay.
function overlayLabel(input: { stage: Stage; error: string; outcome: Outcome; savedCount: number; hasRejected: boolean; verified: boolean }): string {
  if (!isInGame(input.stage)) {
    return input.error ? "Check the outline, then detect again" : "Reading all nine squares…";
  }
  if (input.outcome === "draw") return "Draw · all squares confirmed";
  if (input.outcome) return `${input.outcome} wins · ${input.savedCount} confirmed`;
  if (input.hasRejected) {
    return `${input.savedCount}/9 detected · check the move`;
  }
  const watch = input.verified ? "watching" : "checking the paper";
  return `${input.savedCount}/9 detected · ${watch}`;
}

// Builds the spoken description of the whole overlay.
export function overlayAriaLabel(label: string, cells: OverlayCell[], targetHint: string | null): string {
  const details = cells.map((cell, index) => `${CELL_NAMES[index]}: ${cell.mark ?? (cell.checking ? "unconfirmed mark" : "empty")}, ${cell.status}`).join(", ");
  const hint = targetHint ? `. ${targetHint} Dashed marks are not confirmed.` : "";
  return `${label}. ${details}${hint}`;
}

// Assembles cells, hints, and outcome for the overlay.
export function buildOverlayView(game: OverlayGameSnapshot, geometry: OverlayGeometry): OverlayView {
  const readable = isOverlayReadable(game);
  const verified = readable && game.session.pageMatchesBoard;
  const canSuggest = isInGame(game.stage) && !game.session.paused && hasPendingMove(game.session);
  const cells = buildOverlayCells(game, readable, canSuggest);
  const targetHint = canSuggest && game.session.pendingMove !== null ? (game.session.recognizedBoard[game.session.pendingMove] === "O" ? "O detected · checking the turn" : drawOInstruction(game.session.pendingMove)) : null;
  const savedCount = game.session.recognizedBoard.filter(Boolean).length;
  const outcome = isInGame(game.stage) && game.session.phase === "finished" ? getOutcome(game.session.board) : null;
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

// Returns finding-board copy, or null when idle.
export function boardAnalysisLabel(game: OverlayGameSnapshot, hasGeometry = false): string | null {
  if (game.session.paused || game.error) return null;
  if (isInGame(game.stage) && hasGeometry) return null;
  if (game.stage === "detecting") return "Finding the board…";
  if (game.stage === "calibrating") return "Checking the board…";
  if (isInGame(game.stage) && game.session.phase !== "finished") return "Finding the board…";
  return null;
}
