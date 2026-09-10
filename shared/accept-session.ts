import type { Board, Session } from "./types";
import {
  addedCells,
  checkLegality,
  chooseMove,
  getOutcome,
  phaseForBoard,
} from "./board.helpers";
import {
  addEvent,
  cellLabel,
  createSession,
  damagedCellMessage,
  expectedMark,
  instruction,
  isUnexpectedMark,
  rejectChange,
  resetStability,
} from "./session.helpers";

function mergeRecognized(session: Session, board: Board): Board {
  return board.map((saved, index) => saved ?? session.recognizedBoard[index]);
}

function confirmKind(
  session: Session,
  mark: "X" | "O",
): "observed-move" | "human-move" | "ai-confirmed" {
  if (session.mode === "replay") return "observed-move";
  return mark === "X" ? "human-move" : "ai-confirmed";
}

function applyConfirmedMark(
  session: Session,
  board: Board,
  cell: number,
  at: number,
): Session {
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

function closeGame(session: Session, at: number): Session {
  const result = getOutcome(session.board);
  let next = { ...session, ...result, phase: "finished" as const };
  next = { ...next, message: instruction(next) };
  return addEvent(next, { at, kind: "result", message: next.message });
}

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

function afterConfirm(
  previous: Session,
  session: Session,
  board: Board,
  mark: "X" | "O",
  at: number,
): Session {
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

export function confirmMove(
  session: Session,
  board: Board,
  cell: number,
  at: number,
): Session {
  return afterConfirm(
    session,
    applyConfirmedMark(session, board, cell, at),
    board,
    board[cell] as "X" | "O",
    at,
  );
}

function rejectIfDamaged(
  session: Session,
  observed: Board,
  at: number,
): Session | null {
  const damagedCell = session.board.findIndex(
    (mark, cell) => mark !== null && mark !== observed[cell],
  );
  if (damagedCell === -1) return null;
  return rejectChange(session, damagedCellMessage(session, damagedCell), at);
}

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

function acceptReplayAdditions(
  session: Session,
  observed: Board,
  additions: number[],
  at: number,
): Session {
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
  return result.outcome
    ? addEvent(next, { at, kind: "result", message: next.message })
    : next;
}

function acceptMultipleAdditions(
  session: Session,
  observed: Board,
  additions: number[],
  at: number,
): Session {
  if (session.mode === "replay") {
    return acceptReplayAdditions(session, observed, additions, at);
  }
  const expected =
    session.phase === "human"
      ? "one new X"
      : `only the O in ${cellLabel(session.pendingMove!)}`;
  return rejectChange(
    session,
    `I can see ${additions.length} new marks. Keep ${expected} and remove the extra marks.`,
    at,
  );
}

function unexpectedAddition(
  session: Session,
  observed: Board,
  cell: number,
  at: number,
): Session {
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
  return rejectChange(
    session,
    `O belongs in ${cellLabel(session.pendingMove!)}. Remove the O in ${cellLabel(cell)} and draw it in the selected square.`,
    at,
  );
}

function acceptSingleAddition(
  session: Session,
  observed: Board,
  cell: number,
  at: number,
): Session {
  if (isUnexpectedMark(session, observed[cell], cell)) {
    return unexpectedAddition(session, observed, cell, at);
  }
  const legality = checkLegality(observed);
  if (!legality.valid) return rejectChange(session, legality.reason, at);
  return confirmMove(session, observed, cell, at);
}

export function acceptStableBoard(
  session: Session,
  observed: Board,
  at: number,
): Session {
  const damaged = rejectIfDamaged(session, observed, at);
  if (damaged) return damaged;
  const additions = addedCells(session.board, observed);
  if (additions.length === 0) return acceptUnchangedBoard(session, at);
  if (session.phase === "finished") {
    return rejectChange(
      session,
      "The paper changed after the game ended. Restore the confirmed grid, or start a new game.",
      at,
    );
  }
  if (additions.length > 1) {
    return acceptMultipleAdditions(session, observed, additions, at);
  }
  return acceptSingleAddition(session, observed, additions[0], at);
}

function importedMessage(mode: Session["mode"]): string {
  return mode === "replay"
    ? "Opening board detected automatically. Earlier move order is unknown."
    : "Existing board detected automatically. Earlier move order is unknown.";
}

function sessionFromBoard(board: Board, mode: Session["mode"]): Session {
  const result = getOutcome(board);
  const phase = phaseForBoard(board, result.outcome);
  const pendingMove =
    mode === "play" && phase === "draw-ai" ? chooseMove(board) : null;
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

export function resumeBoard(
  board: Board,
  mode: Session["mode"] = "play",
): Session {
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
