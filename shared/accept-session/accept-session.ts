import type { Board } from "../types";
import type { Session } from "../types";
import { addedCells } from "../board-helpers/board.helpers";
import { checkLegality } from "../board-helpers/board.helpers";
import { chooseMove } from "../board-helpers/board.helpers";
import { getOutcome } from "../board-helpers/board.helpers";
import { phaseForBoard } from "../board-helpers/board.helpers";
import { addEvent } from "../session-helpers/session.helpers";
import { cellLabel } from "../session-helpers/session.helpers";
import { createSession } from "../session-helpers/session.helpers";
import { damagedCellMessage } from "../session-helpers/session.helpers";
import { expectedMark } from "../session-helpers/session.helpers";
import { instruction } from "../session-helpers/session.helpers";
import { isUnexpectedMark } from "../session-helpers/session.helpers";
import { rejectChange } from "../session-helpers/session.helpers";
import { resetStability } from "../session-helpers/session.helpers";

type ConfirmedMark = {
  session: Session;
  board: Board;
  cell: number;
  at: number;
};

type ObservedBoard = {
  session: Session;
  observed: Board;
  at: number;
};

type ObservedAdditions = ObservedBoard & { additions: number[] };

type ObservedCell = ObservedBoard & { cell: number };

type AfterConfirm = {
  previous: Session;
  session: Session;
  board: Board;
  mark: "X" | "O";
  at: number;
};

// Fills empty observed cells from the last confirmed board.
function mergeRecognized(session: Session, board: Board): Board {
  return board.map((saved, index) => saved ?? session.recognizedBoard[index]);
}

// Names the event for a newly confirmed mark.
function confirmKind(session: Session, mark: "X" | "O"): "observed-move" | "human-move" | "ai-confirmed" {
  if (session.mode === "replay") return "observed-move";
  return mark === "X" ? "human-move" : "ai-confirmed";
}

// Writes a confirmed mark into the session and logs it.
function applyConfirmedMark({ session, board, cell, at }: ConfirmedMark): Session {
  const mark = board[cell] as "X" | "O";
  return addEvent(
    {
      ...resetStability(session),
      board: [...board],
      recognizedBoard: mergeRecognized(session, board),
      boardCheck: "ready",
      pageMatchesBoard: true,
      recoveryReason: null,
      pendingMove: null,
    },
    {
      at,
      kind: confirmKind(session, mark),
      message: `${mark} confirmed in ${cellLabel(cell)}.`,
      cell,
      mark,
    },
  );
}

// Ends the game once a winner or draw is confirmed.
function closeGame(session: Session, at: number): Session {
  const result = getOutcome(session.board);
  let next = { ...session, ...result, phase: "finished" as const };
  next = { ...next, message: instruction(next) };
  return addEvent(next, { at, kind: "result", message: next.message });
}

// Picks O's next square and waits to see it on paper.
function intendO(session: Session, board: Board, at: number): Session {
  const pendingMove = chooseMove(board);
  let next = { ...session, phase: "draw-ai" as const, pendingMove };
  next = { ...next, message: instruction(next) };
  if (pendingMove === null) return next;
  return addEvent(next, {
    at,
    kind: "ai-intent",
    message: `O selected ${cellLabel(pendingMove)}. Waiting to see it drawn on paper.`,
    cell: pendingMove,
    mark: "O",
  });
}

// Advances the turn after a mark is confirmed.
function afterConfirm({ previous, session, board, mark, at }: AfterConfirm): Session {
  if (getOutcome(board).outcome !== null) return closeGame(session, at);
  if (previous.mode === "replay") {
    const next = {
      ...session,
      phase: mark === "X" ? ("draw-ai" as const) : ("human" as const),
    };
    return { ...next, message: instruction(next) };
  }
  if (mark === "X") return intendO(session, board, at);
  const next = { ...session, phase: "human" as const };
  return { ...next, message: instruction(next) };
}

// Confirms one new mark and continues the game.
export function confirmMove({ session, board, cell, at }: ConfirmedMark): Session {
  return afterConfirm({
    previous: session,
    session: applyConfirmedMark({ session, board, cell, at }),
    board,
    mark: board[cell] as "X" | "O",
    at,
  });
}

// Rejects a board that overwrote a confirmed mark.
function rejectIfDamaged(session: Session, observed: Board, at: number): Session | null {
  const damagedCell = session.board.findIndex((mark, cell) => mark !== null && mark !== observed[cell]);
  if (damagedCell === -1) return null;
  return rejectChange(session, damagedCellMessage(session, damagedCell), at);
}

// Accepts a still board and clears a recovered mismatch.
function acceptUnchangedBoard(session: Session, at: number): Session {
  let next: Session = {
    ...session,
    ...getOutcome(session.board),
    recoveryReason: null,
    boardCheck: "ready",
    pageMatchesBoard: true,
  };
  next = { ...next, message: instruction(next) };
  if (session.recoveryReason === null) return next;
  return addEvent(next, {
    at,
    kind: "recovered",
    message: "The paper matches the confirmed grid again.",
  });
}

// Confirms several new marks in a recorded game.
function acceptReplayAdditions({ session, observed, additions, at }: ObservedAdditions): Session {
  const legality = checkLegality(observed);
  if (!legality.valid) return rejectChange(session, legality.reason, at);
  const result = getOutcome(observed);
  let next: Session = {
    ...resetStability(session),
    ...result,
    board: [...observed],
    recognizedBoard: mergeRecognized(session, observed),
    phase: phaseForBoard(observed, result.outcome),
    pendingMove: null,
    recoveryReason: null,
    boardCheck: "ready",
    pageMatchesBoard: true,
  };
  next = addEvent(next, {
    at,
    kind: "board-sync",
    board: [...observed],
    message: `${additions.length} additional marks confirmed in a stable recorded board. Intermediate move order is unknown.`,
  });
  next = { ...next, message: instruction(next) };
  return result.outcome ? addEvent(next, { at, kind: "result", message: next.message }) : next;
}

// Allows extra marks only in replay; otherwise asks to undo them.
function acceptMultipleAdditions({ session, observed, additions, at }: ObservedAdditions): Session {
  if (session.mode === "replay") {
    return acceptReplayAdditions({ session, observed, additions, at });
  }
  const expected = session.phase === "human" ? "one new X" : `only the O in ${cellLabel(session.pendingMove!)}`;
  return rejectChange(session, `I can see ${additions.length} new marks. Keep ${expected} and remove the extra marks.`, at);
}

// Rejects a new mark that is the wrong letter or square.
function unexpectedAddition({ session, observed, cell, at }: ObservedCell): Session {
  const expected = expectedMark(session);
  if (observed[cell] !== expected) {
    return rejectChange(
      session,
      session.mode === "replay"
        ? `The recording shows ${observed[cell]} in ${cellLabel(cell)}, but ${expected} is next. This turn cannot be confirmed.`
        : `This turn needs ${expected}. Remove the ${observed[cell]} in ${cellLabel(cell)}, then draw ${expected}.`,
      at,
    );
  }
  return rejectChange(session, `O belongs in ${cellLabel(session.pendingMove!)}. Remove the O in ${cellLabel(cell)} and draw it in the selected square.`, at);
}

// Confirms one legal new mark, or explains why it is wrong.
function acceptSingleAddition({ session, observed, cell, at }: ObservedCell): Session {
  if (isUnexpectedMark(session, observed[cell], cell)) {
    return unexpectedAddition({ session, observed, cell, at });
  }
  const legality = checkLegality(observed);
  if (!legality.valid) return rejectChange(session, legality.reason, at);
  return confirmMove({ session, board: observed, cell, at });
}

// Accepts a stable photographed board, or says what to fix.
export function acceptStableBoard(session: Session, observed: Board, at: number): Session {
  const damaged = rejectIfDamaged(session, observed, at);
  if (damaged) return damaged;
  const additions = addedCells(session.board, observed);
  if (additions.length === 0) return acceptUnchangedBoard(session, at);
  if (session.phase === "finished") {
    return rejectChange(session, "The paper changed after the game ended. Restore the confirmed grid, or start a new game.", at);
  }
  if (additions.length > 1) {
    return acceptMultipleAdditions({ session, observed, additions, at });
  }
  return acceptSingleAddition({
    session,
    observed,
    cell: additions[0],
    at,
  });
}

// Explains that the opening board was imported without move order.
function importedMessage(mode: Session["mode"]): string {
  return mode === "replay" ? "Opening board detected automatically. Earlier move order is unknown." : "Existing board detected automatically. Earlier move order is unknown.";
}

// Builds a session from an already-filled board.
function sessionFromBoard(board: Board, mode: Session["mode"]): Session {
  const result = getOutcome(board);
  const phase = phaseForBoard(board, result.outcome);
  const pendingMove = mode === "play" && phase === "draw-ai" ? chooseMove(board) : null;
  return {
    ...createSession(mode),
    ...result,
    board: [...board],
    recognizedBoard: [...board],
    phase,
    pendingMove,
    boardCheck: "ready",
    events: [
      {
        id: "event-1",
        at: 0,
        kind: "board-imported",
        message: importedMessage(mode),
      },
    ],
  };
}

// Starts or resumes from a legal photographed board.
export function resumeBoard(board: Board, mode: Session["mode"] = "play"): Session {
  const legality = checkLegality(board);
  if (!legality.valid) throw new Error(legality.reason);
  let session = sessionFromBoard(board, mode);
  session = { ...session, message: instruction(session) };
  if (session.pendingMove === null) return session;
  return addEvent(session, {
    at: 0,
    kind: "ai-intent",
    cell: session.pendingMove,
    mark: "O",
    message: instruction(session),
  });
}
