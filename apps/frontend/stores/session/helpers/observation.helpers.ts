import type { Board } from "../../../types";
import type { Observation } from "../../../types";
import type { Session } from "../../../types";
import { updateCandidates } from "./cell-recognition.helpers";
import { advanceRecognizedTurn } from "./cell-recognition.helpers";
import { addedCells } from "@shared/board-helpers/board.helpers";
import { checkLegality } from "@shared/board-helpers/board.helpers";
import { getOutcome } from "@shared/board-helpers/board.helpers";
import { MAX_OBSERVATION_GAP_MS } from "@shared/session-helpers/session.helpers";
import { MAX_CELL_READING_GAP_MS } from "@shared/session-helpers/session.helpers";
import { cellVisible } from "@shared/session-helpers/session.helpers";
import { REQUIRED_STABLE_FRAMES } from "@shared/session-helpers/session.helpers";
import { STABLE_WINDOW_MS } from "@shared/session-helpers/session.helpers";
import { checkVisibleChange } from "@shared/session-helpers/session.helpers";
import { damagedCellMessage } from "@shared/session-helpers/session.helpers";
import { expectedMark } from "@shared/session-helpers/session.helpers";
import { instruction } from "@shared/session-helpers/session.helpers";
import { isUnexpectedMark } from "@shared/session-helpers/session.helpers";
import { rejectChange } from "@shared/session-helpers/session.helpers";
import { resetStability } from "@shared/session-helpers/session.helpers";
import { stableCell } from "@shared/session-helpers/session.helpers";
import { withUnverifiedPage } from "@shared/session-helpers/session.helpers";
import { cellLabel } from "@shared/session-helpers/session.helpers";
import { acceptStableBoard } from "@shared/accept-session/accept-session";
import { confirmMove } from "@shared/accept-session/accept-session";

type ObservationFrame = {
  session: Session;
  observation: Observation;
  visible: boolean[];
  at: number;
};

type ObservationCheck = ObservationFrame & { localReadings: boolean };

// Rejects a visible mark that no longer matches the board.
export function checkPartialDamage({ session, observation, visible, at }: ObservationFrame): Session | null {
  const damagedCells = session.board.flatMap((mark, index) => (mark !== null && visible[index] && observation.cells[index].mark !== mark ? [index] : []));
  if (!damagedCells.length) return null;
  const stableDamage = damagedCells.find((index) => stableCell(session.cellCandidates[index], at));
  const damaged = stableDamage ?? damagedCells[0];
  return checkVisibleChange({
    session,
    reason: damagedCellMessage(session, damaged),
    at,
    stable: stableDamage !== undefined,
  });
}

// Lists newly visible marks on empty squares.
function visibleAdditions(session: Session, observation: Observation, visible: boolean[]): number[] {
  return observation.cells.flatMap((cell, index) => (visible[index] && cell.mark !== null && session.board[index] === null ? [index] : []));
}

// Rejects several new marks seen at once.
function checkMultipleAdditions({ session, observation, additions, at }: ObservationFrame & { additions: number[] }): Session {
  const stableAdditions = additions.filter((index) => stableCell(session.cellCandidates[index], at));
  const wrongAddition = stableAdditions.some((index) => isUnexpectedMark(session, observation.cells[index].mark, index));
  return checkVisibleChange({
    session,
    reason:
      session.mode === "replay"
        ? `The recording shows ${additions.length} new marks at once. Waiting for a clear view of the whole board to verify it.`
        : `I can see ${additions.length} new marks. Show the whole grid and leave only the expected move.`,
    at,
    stable: session.mode === "play" && (stableAdditions.length > 1 || wrongAddition),
  });
}

// Explains an unexpected new mark.
function unexpectedAdditionMessage(session: Session, expected: "X" | "O"): string {
  if (session.mode === "replay") {
    return `The recording shows an unexpected mark. This turn needs one ${expected}.`;
  }
  if (session.phase === "draw-ai") {
    return `Draw only O in ${cellLabel(session.pendingMove!)}. Remove the unexpected mark and show the whole grid.`;
  }
  return "This turn needs one X. Remove the unexpected O and show the whole grid.";
}

// Confirms one stable legal new mark.
function tryConfirmPartialMove({ session, index, mark, at }: { session: Session; index: number; mark: "X" | "O"; at: number }): Session | null {
  const candidate = session.cellCandidates[index];
  if (session.recoveryReason !== null || !stableCell(candidate, at)) return null;
  const board = [...session.board];
  board[index] = mark;
  const legality = checkLegality(board);
  if (!legality.valid) return rejectChange(session, legality.reason, at);
  if (getOutcome(board).outcome !== null) {
    return {
      ...withUnverifiedPage(session),
      message: session.mode === "replay" ? "The final move is visible. Waiting for a clear view of the whole grid to confirm the recorded result." : "The final move is visible. Clear the whole grid to confirm the result.",
    };
  }
  return withUnverifiedPage(confirmMove({ session, board, cell: index, at }));
}

// Checks one newly visible mark.
function checkSingleAddition({ session, observation, index, at }: { session: Session; observation: Observation; index: number; at: number }): Session | null {
  const mark = observation.cells[index].mark as "X" | "O";
  const expected = expectedMark(session);
  if (session.phase === "finished") {
    return checkVisibleChange({
      session,
      reason: "The paper changed after the game ended. Restore the confirmed grid, or start a new game.",
      at,
      stable: stableCell(session.cellCandidates[index], at),
    });
  }
  if (isUnexpectedMark(session, mark, index)) {
    return checkVisibleChange({
      session,
      reason: unexpectedAdditionMessage(session, expected),
      at,
      stable: stableCell(session.cellCandidates[index], at),
    });
  }
  return tryConfirmPartialMove({ session, index, mark, at });
}

// Handles newly visible marks on a partial board.
export function checkPartialAdditions({ session, observation, visible, at }: ObservationFrame): Session | null {
  const additions = visibleAdditions(session, observation, visible);
  if (additions.length > 1) {
    return checkMultipleAdditions({ session, observation, visible, additions, at });
  }
  const index = additions[0];
  if (index === undefined) return null;
  return checkSingleAddition({ session, observation, index, at });
}

// Advances time or drops a stale or paused frame.
function applyTiming(session: Session, at: number): Session | null {
  if (session.paused || !Number.isFinite(at) || at < 0 || (session.lastObservationAt !== null && at <= session.lastObservationAt)) return null;
  const staleGap = session.lastObservationAt !== null && at - session.lastObservationAt > MAX_OBSERVATION_GAP_MS;
  let next: Session = {
    ...session,
    lastObservationAt: at,
    checkingChange: false,
  };
  if (staleGap)
    next = {
      ...resetStability(withUnverifiedPage(next)),
      boardCheck: "interrupted",
    };
  return next;
}

// True when every square has a local reading.
function hasLocalReadings(observation: Observation): boolean {
  return observation.cells.length === 9 && observation.cells.every((cell) => typeof cell.readable === "boolean");
}

// True when the whole page cannot be read.
function isGloballyBlocked(observation: Observation, localReadings: boolean): boolean {
  if (observation.quality === "dark") return true;
  if (observation.quality === "misaligned") return true;
  if (observation.cells.length !== 9) return true;
  return !localReadings && observation.quality !== "good";
}

// True when quality should interrupt the board check.
function isInterruptQuality(session: Session, observation: Observation, localReadings: boolean): boolean {
  if (session.boardCheck === "interrupted") return true;
  if (observation.quality === "dark") return true;
  if (observation.cells.length !== 9) return true;
  return !localReadings && observation.quality !== "good" && observation.quality !== "misaligned";
}

// Resets stability after a blocked or reacquired page.
function applyBlockedQuality(session: Session, observation: Observation, interrupt: boolean): Session {
  const reset = resetStability(withUnverifiedPage(session));
  if (!interrupt && !observation.reacquired) {
    reset.cellCandidates = session.cellCandidates.map((candidate) => (candidate && observation.timestamp - candidate.lastSeen <= MAX_CELL_READING_GAP_MS ? candidate : null));
  }
  return {
    ...reset,
    boardCheck: interrupt ? "interrupted" : observation.reacquired === true ? "verifying-grid" : "finding-grid",
    message: observation.reacquired ? "Grid found again. Checking the previously observed marks before continuing." : observation.message || "Keep the whole grid visible in good light.",
  };
}

// True when a blocked frame should stop further work.
function shouldStopAfterBlock(observation: Observation, localReadings: boolean): boolean {
  return !observation.reacquired || observation.quality === "dark" || !localReadings;
}

// Updates the session for the current frame quality.
function applyQuality(session: Session, observation: Observation): { session: Session; localReadings: boolean; done: boolean } {
  const localReadings = hasLocalReadings(observation);
  const globallyBlocked = isGloballyBlocked(observation, localReadings);
  let next = session;
  if (globallyBlocked || observation.reacquired === true) {
    const interrupt = isInterruptQuality(next, observation, localReadings);
    next = applyBlockedQuality(next, observation, interrupt);
    if (shouldStopAfterBlock(observation, localReadings)) {
      return { session: next, localReadings, done: true };
    }
  }
  if ((next.boardCheck === "finding-grid" || next.boardCheck === "verifying-grid") && !globallyBlocked && localReadings) {
    next = { ...next, boardCheck: "verifying-grid" };
  }
  return { session: next, localReadings, done: false };
}

// Tracks a fully visible candidate board.
function applyReadableBoard(session: Session, observed: Board, at: number): Session {
  const key = observed.map((mark) => mark ?? "_").join("");
  const next = observed.every((mark, cell) => mark === session.board[cell]) ? session : withUnverifiedPage(session);
  const sameCandidate = key === next.candidateKey;
  return {
    ...next,
    candidateKey: key,
    candidateSeenAt: at,
    stableFrames: sameCandidate ? Math.min(REQUIRED_STABLE_FRAMES, next.stableFrames + 1) : 1,
    stableSince: sameCandidate ? next.stableSince : at,
  };
}

// Holds or clears a candidate when squares are hidden.
function applyUnreadableBoard({ session, observation, visible, at }: ObservationFrame): Session {
  const recent = session.candidateSeenAt !== null && at - session.candidateSeenAt <= MAX_CELL_READING_GAP_MS;
  const compatible = session.candidateKey !== null && observation.cells.every((cell, index) => !visible[index] || (cell.mark ?? "_") === session.candidateKey![index]);
  return {
    ...withUnverifiedPage(session),
    ...(recent && compatible
      ? {}
      : {
          stableFrames: 0,
          stableSince: null,
          candidateKey: null,
          candidateSeenAt: null,
        }),
  };
}

// True when each new mark is stable and legal.
function hasVerifiedChanges({ session, observed, additions, localReadings, at }: { session: Session; observed: Board; additions: number[]; localReadings: boolean; at: number }): boolean {
  if (!localReadings) return false;
  if (session.boardCheck === "interrupted") return false;
  if (session.recoveryReason !== null) return false;
  if (!session.board.every((mark, index) => mark === null || mark === observed[index])) return false;
  if (additions.length === 0) return false;
  return additions.every((index) => session.cellCandidates[index]?.mark === observed[index] && stableCell(session.cellCandidates[index], at));
}

// True when the full board has stayed still long enough.
function isFullyStable(session: Session, at: number): boolean {
  return session.stableFrames >= REQUIRED_STABLE_FRAMES && session.stableSince !== null && at - session.stableSince >= STABLE_WINDOW_MS;
}

// Accepts a stable full board when it is ready.
function tryAcceptStable({ session, observation, visible, at, localReadings }: ObservationCheck): { session: Session; accepted: Session | null } {
  if (!visible.every(Boolean)) {
    return {
      session: applyUnreadableBoard({ session, observation, visible, at }),
      accepted: null,
    };
  }
  const observed = observation.cells.map((cell) => cell.mark) as Board;
  const next = applyReadableBoard(session, observed, at);
  const additions = addedCells(next.board, observed);
  if (hasVerifiedChanges({ session: next, observed, additions, localReadings, at }) || isFullyStable(next, at)) {
    return { session: next, accepted: acceptStableBoard(next, observed, at) };
  }
  return { session: next, accepted: null };
}

// True when known marks still match the page.
function confirmedMarksMatch({ session, observation, visible, at }: ObservationFrame): boolean {
  const known = session.board.some(Boolean) ? session.board : session.recognizedBoard;
  return known.every((mark, index) => mark === null || (visible[index] && observation.cells[index].mark === mark && session.cellCandidates[index]?.mark === mark && stableCell(session.cellCandidates[index], at)));
}

// True when a found grid can be marked ready.
function canClearRegistration({ session, observation, visible, at, localReadings }: ObservationCheck): boolean {
  if (session.boardCheck !== "verifying-grid") return false;
  if (!localReadings) return false;
  if (session.phase === "finished") return false;
  if (!session.board.some(Boolean) && !session.recognizedBoard.some(Boolean)) return false;
  return confirmedMarksMatch({ session, observation, visible, at });
}

// Marks the board ready once known marks match.
function maybeClearRegistration(input: ObservationCheck): Session {
  if (!canClearRegistration(input)) {
    return input.session;
  }
  return {
    ...withUnverifiedPage(input.session),
    boardCheck: "ready",
  };
}

// Asks for a full grid before continuing.
function holdForBoardCheck(session: Session): Session {
  return {
    ...withUnverifiedPage(session),
    message: session.recoveryReason ?? "Show the whole grid briefly so I can check the board before continuing.",
  };
}

// Returns the waiting instruction for the current turn.
function waitingMessage(session: Session): string {
  if (session.recoveryReason !== null) return session.recoveryReason;
  if (session.pageMatchesBoard) return instruction(session);
  if (session.mode === "replay") {
    return "Reading the visible squares in the recording. Waiting for stable evidence of the next move.";
  }
  return "Reading the visible squares. Keep each new mark clear and still for a moment.";
}

// Updates the session from one new observation.
export function observe(session: Session, observation: Observation): Session {
  const at = observation.timestamp;
  const timed = applyTiming(session, at);
  if (timed === null) return session;
  const quality = applyQuality(timed, observation);
  if (quality.done) return quality.session;
  const visible = observation.cells.map(cellVisible);
  const frame = { observation, visible, at, localReadings: quality.localReadings };
  let next = updateCandidates({ session: quality.session, ...frame });
  const advanced = advanceRecognizedTurn(next, observation);
  if (advanced) return advanced;
  next = maybeClearRegistration({ session: next, ...frame });
  const attempt = tryAcceptStable({ session: next, ...frame });
  if (attempt.accepted) return attempt.accepted;
  next = attempt.session;
  if (next.boardCheck !== "ready") return holdForBoardCheck(next);
  if (frame.localReadings) {
    const damaged = checkPartialDamage({ session: next, ...frame });
    if (damaged) return damaged;
    const added = checkPartialAdditions({ session: next, ...frame });
    if (added) return added;
  }
  return { ...next, message: waitingMessage(next) };
}
