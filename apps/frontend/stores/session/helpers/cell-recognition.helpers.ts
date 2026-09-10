import type {
  CellCandidate,
  CellReading,
  Observation,
  Session,
} from "../../../types";
import {
  MAX_CELL_READING_GAP_MS,
  MIN_CHECKING_INK,
  REQUIRED_STABLE_FRAMES,
  stableCell,
  hasPendingMove,
  cellVisible,
  withUnverifiedPage,
} from "@shared/session.helpers";
import { confirmMove } from "@shared/accept-session";
import { checkLegality, getOutcome } from "@shared/board.helpers";

function nextCandidate(
  previous: CellCandidate | null,
  cell: CellReading,
  visible: boolean,
  at: number,
): CellCandidate | null {
  const recent = previous && at - previous.lastSeen <= MAX_CELL_READING_GAP_MS;
  if (!visible) return recent ? previous : null;
  const mark = cell.mark as "X" | "O" | null;
  return recent && previous.mark === mark
    ? {
        ...previous,
        lastSeen: at,
        frames: Math.min(REQUIRED_STABLE_FRAMES, previous.frames + 1),
      }
    : { mark, frames: 1, since: at, lastSeen: at };
}

export function updateCandidates(
  session: Session,
  observation: Observation,
  visible: boolean[],
  at: number,
  localReadings: boolean,
): Session {
  if (!localReadings) return session;
  const cellCandidates = observation.cells.map((cell, index) =>
    nextCandidate(session.cellCandidates[index], cell, visible[index], at),
  );
  const canCorrect = observation.quality === "good" && visible.every(Boolean);
  const recognizedBoard = session.recognizedBoard.map((saved, index) => {
    if (session.board[index]) return session.board[index];
    const candidate = cellCandidates[index];
    if (!visible[index] || !stableCell(candidate, at)) return saved;
    if (candidate!.mark !== null) return saved ?? candidate!.mark;
    return canCorrect ? null : saved;
  });
  const cellReadingStartedAt = observation.cells.map((cell, index) => {
    if (recognizedBoard[index] || (visible[index] && cell.mark === null))
      return null;
    const started = session.cellReadingStartedAt[index];
    return cell.ink > MIN_CHECKING_INK ? (started ?? at) : started;
  });
  return { ...session, cellCandidates, recognizedBoard, cellReadingStartedAt };
}

function recognizedTurnCell(session: Session): number | null {
  if (hasPendingMove(session)) {
    const cell = session.pendingMove!;
    return session.recognizedBoard[cell] === "O" && session.board[cell] === null
      ? cell
      : null;
  }
  if (session.phase !== "human") return null;
  const additions = session.recognizedBoard.flatMap((mark, cell) =>
    mark === "X" && session.board[cell] === null ? [cell] : [],
  );
  return additions.length === 1 ? additions[0] : null;
}

export function advanceRecognizedTurn(
  session: Session,
  observation: Observation,
): Session | null {
  if (session.mode !== "play" || observation.quality === "misaligned")
    return null;
  const cell = recognizedTurnCell(session);
  if (cell === null) return null;
  const damaged = observation.cells.some(
    (reading, index) =>
      session.board[index] !== null &&
      cellVisible(reading) &&
      stableCell(session.cellCandidates[index], observation.timestamp) &&
      reading.mark !== session.board[index],
  );
  if (damaged) return null;
  const board = [...session.board];
  board[cell] = session.recognizedBoard[cell];
  if (!checkLegality(board).valid) return null;
  const matching = observation.cells.every(
    (reading, index) => cellVisible(reading) && reading.mark === board[index],
  );
  const final = getOutcome(board).outcome !== null;
  if (
    final &&
    (!matching ||
      !session.cellCandidates.every((candidate) =>
        stableCell(candidate, observation.timestamp),
      ))
  )
    return null;
  const next = confirmMove(session, board, cell, observation.timestamp);
  return matching ? next : withUnverifiedPage(next);
}
