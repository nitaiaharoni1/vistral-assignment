import { model, PROMPT_VERSION } from "../analyze";
import type { SavedGame } from "../../storage/storage";
import type {
  AgentReply,
  BoardAnalysis,
} from "../../../../shared/agent-protocol";
import {
  addEvent,
  cellLabel,
  hasPendingMove,
  instruction,
} from "../../../../shared/session.helpers";
import {
  acceptStableBoard,
  resumeBoard,
} from "../../../../shared/accept-session";
import {
  addedCells,
  checkLegality,
  sameBoard,
} from "../../../../shared/board.helpers";
import { CELL_NAMES, type Board, type Session } from "../../../../shared/types";

const MIN_CELL_CONFIDENCE = 0.85;

type AnalysisUpdate = Pick<
  AgentReply,
  "session" | "status" | "message" | "decisionSource" | "notice"
>;

export function preservePendingMove(
  session: Session,
  previous: Session,
): Session {
  if (previous.pendingMove !== null && sameBoard(previous.board, session.board))
    return { ...session, pendingMove: previous.pendingMove };
  return session;
}

function hold(
  session: Session,
  status: "uncertain" | "rejected",
  message: string,
): AnalysisUpdate {
  return { session, status, message, decisionSource: "saved" };
}

function unclear(analysis: BoardAnalysis): boolean {
  return (
    !analysis.clear ||
    analysis.cells.some(
      (cell) =>
        cell.mark === "unknown" || cell.confidence < MIN_CELL_CONFIDENCE,
    )
  );
}

function observedBoard(analysis: BoardAnalysis): Board {
  return analysis.cells.map((cell) =>
    cell.mark === "empty" ? null : cell.mark,
  ) as Board;
}

function replySource(
  next: Session,
  previous: Session,
): { session: Session; source: AgentReply["decisionSource"] } {
  if (next.phase !== "draw-ai" || next.mode !== "play")
    return { session: next, source: "saved" };
  if (previous.pendingMove !== null && sameBoard(previous.board, next.board))
    return { session: preservePendingMove(next, previous), source: "saved" };
  return { session: next, source: "rules" };
}

function acceptPaperBoard(
  current: Session,
  board: Board,
): { session: Session; notice: string | null } {
  const additions = addedCells(current.board, board);
  const cell = additions[0];
  const relocated =
    hasPendingMove(current) &&
    additions.length === 1 &&
    board[cell] === "O" &&
    cell !== current.pendingMove;
  const session = acceptStableBoard(
    relocated ? { ...current, pendingMove: cell } : current,
    board,
    Date.now(),
  );
  if (!relocated || session.recoveryReason) return { session, notice: null };
  const notice = `O was drawn in ${cellLabel(cell)} instead of ${cellLabel(current.pendingMove!)}. ${instruction(session)}`;
  return {
    session: addEvent(
      { ...session, message: notice },
      {
        at: Date.now(),
        kind: "ai-placement-changed",
        cell,
        mark: "O",
        board: [...board],
        message: notice,
      },
    ),
    notice: `O accepted in ${CELL_NAMES[cell]}.`,
  };
}

function applyAccepted(
  game: SavedGame,
  current: Session,
  board: Board,
): AnalysisUpdate {
  const accepted = game.initialized
    ? acceptPaperBoard(current, board)
    : {
        session: { ...resumeBoard(board), pageMatchesBoard: true },
        notice: null,
      };
  if (accepted.session.recoveryReason)
    return hold(current, "rejected", accepted.session.recoveryReason);
  game.initialized = true;
  const selected = replySource(accepted.session, current);
  const next = addEvent(selected.session, {
    at: Date.now(),
    kind: "agent-analysis",
    message: `${model}; ${PROMPT_VERSION}; decision: ${selected.source}; snapshot confirmed.`,
    board: [...board],
  });
  return {
    session: next,
    status: "ready",
    message: accepted.notice ?? instruction(next),
    notice: accepted.notice,
    decisionSource: selected.source,
  };
}

export function acceptAnalysis(
  game: SavedGame,
  analysis: BoardAnalysis,
): AnalysisUpdate {
  const current = game.reply.session;
  if (unclear(analysis))
    return hold(
      current,
      "uncertain",
      "Keep the whole board clear and still, then try again.",
    );
  const board = observedBoard(analysis);
  const legal = checkLegality(board);
  if (!legal.valid) return hold(current, "rejected", legal.reason);
  return applyAccepted(game, current, board);
}
