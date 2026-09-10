import type { CellCandidate } from "../../../types";
import type { CellReading } from "../../../types";
import type { Observation } from "../../../types";
import type { Session } from "../../../types";
import { MAX_CELL_READING_GAP_MS } from "@shared/session-helpers/session.helpers";
import { MIN_CHECKING_INK } from "@shared/session-helpers/session.helpers";
import { REQUIRED_STABLE_FRAMES } from "@shared/session-helpers/session.helpers";
import { stableCell } from "@shared/session-helpers/session.helpers";
import { hasPendingMove } from "@shared/session-helpers/session.helpers";
import { cellVisible } from "@shared/session-helpers/session.helpers";
import { withUnverifiedPage } from "@shared/session-helpers/session.helpers";
import { confirmMove } from "@shared/accept-session/accept-session";
import { checkLegality } from "@shared/board-helpers/board.helpers";
import { getOutcome } from "@shared/board-helpers/board.helpers";

// Updates one square's mark candidate.
function nextCandidate({ previous, cell, visible, at }: { previous: CellCandidate | null; cell: CellReading; visible: boolean; at: number }): CellCandidate | null {
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

// Updates candidates and the recognized board.
export function updateCandidates({ session, observation, visible, at, localReadings }: { session: Session; observation: Observation; visible: boolean[]; at: number; localReadings: boolean }): Session {
  if (!localReadings) return session;
  const cellCandidates = observation.cells.map((cell, index) => nextCandidate({ previous: session.cellCandidates[index], cell, visible: visible[index], at }));
  const canCorrect = observation.quality === "good" && visible.every(Boolean);
  const recognizedBoard = session.recognizedBoard.map((saved, index) => {
    if (session.board[index]) return session.board[index];
    const candidate = cellCandidates[index];
    if (!visible[index] || !stableCell(candidate, at)) return saved;
    if (candidate!.mark !== null) return saved ?? candidate!.mark;
    return canCorrect ? null : saved;
  });
  const cellReadingStartedAt = observation.cells.map((cell, index) => {
    if (recognizedBoard[index] || (visible[index] && cell.mark === null)) return null;
    const started = session.cellReadingStartedAt[index];
    return cell.ink > MIN_CHECKING_INK ? (started ?? at) : started;
  });
  return { ...session, cellCandidates, recognizedBoard, cellReadingStartedAt };
}

// Finds the one recognized mark that can be confirmed.
function recognizedTurnCell(session: Session): number | null {
  if (hasPendingMove(session)) {
    const cell = session.pendingMove!;
    return session.recognizedBoard[cell] === "O" && session.board[cell] === null ? cell : null;
  }
  if (session.phase !== "human") return null;
  const additions = session.recognizedBoard.flatMap((mark, cell) => (mark === "X" && session.board[cell] === null ? [cell] : []));
  return additions.length === 1 ? additions[0] : null;
}

// Confirms a recognized live mark when the board matches.
export function advanceRecognizedTurn(session: Session, observation: Observation): Session | null {
  if (session.mode !== "play" || observation.quality === "misaligned") return null;
  const cell = recognizedTurnCell(session);
  if (cell === null) return null;
  const damaged = observation.cells.some((reading, index) => session.board[index] !== null && cellVisible(reading) && stableCell(session.cellCandidates[index], observation.timestamp) && reading.mark !== session.board[index]);
  if (damaged) return null;
  const board = [...session.board];
  board[cell] = session.recognizedBoard[cell];
  if (!checkLegality(board).valid) return null;
  const matching = observation.cells.every((reading, index) => cellVisible(reading) && reading.mark === board[index]);
  const final = getOutcome(board).outcome !== null;
  if (final && (!matching || !session.cellCandidates.every((candidate) => stableCell(candidate, observation.timestamp)))) return null;
  const next = confirmMove({ session, board, cell, at: observation.timestamp });
  return matching ? next : withUnverifiedPage(next);
}
