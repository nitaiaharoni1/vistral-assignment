import { CELL_IDS } from "../types";
import { CELL_NAMES } from "../types";
import type { CellCandidate } from "../types";
import type { CellReading } from "../types";
import type { Session } from "../types";
import type { SessionEvent } from "../types";
import { getOutcome } from "../board-helpers/board.helpers";

export const REQUIRED_STABLE_FRAMES = 5;
export const STABLE_WINDOW_MS = 500;
export const MAX_OBSERVATION_GAP_MS = 1500;
export const MIN_CONFIDENCE = 0.78;
export const MIN_CHECKING_INK = 0.006;
export const MAX_CELL_READING_GAP_MS = 1200;

// True when play mode is waiting to see O drawn on paper.
export function hasPendingMove(session: Pick<Session, "mode" | "phase" | "pendingMove">): boolean {
  return session.mode === "play" && session.phase === "draw-ai" && session.pendingMove !== null;
}

// True when a cell reading is clear enough to trust.
export function cellVisible(cell: CellReading): boolean {
  return cell.readable !== false && (cell.mark === null || cell.mark === "X" || cell.mark === "O") && Number.isFinite(cell.confidence) && cell.confidence >= MIN_CONFIDENCE && cell.confidence <= 1;
}

// Names a square in words and as a grid id.
export function cellLabel(cell: number): string {
  return `${CELL_NAMES[cell]} (${CELL_IDS[cell]})`;
}

// Returns the mark that belongs on this turn.
export function expectedMark(session: Session): "X" | "O" {
  return session.phase === "human" ? "X" : "O";
}

// True when the new mark is the wrong letter or square.
export function isUnexpectedMark(session: Session, mark: CellReading["mark"], index: number): boolean {
  if (session.phase === "human") return mark !== "X";
  return mark !== "O" || (session.mode === "play" && index !== session.pendingMove);
}

// Explains that a confirmed mark was overwritten or lost.
export function damagedCellMessage(session: Session, cell: number): string {
  return session.mode === "replay" ? `The recording no longer shows the previously confirmed ${session.board[cell]} in ${cellLabel(cell)}.` : `${cellLabel(cell)} must still contain ${session.board[cell]}. Restore that mark before continuing.`;
}

// Tells the player or watcher what to do next.
export function instruction(session: Session): string {
  if (session.phase === "finished") {
    const { outcome } = getOutcome(session.board);
    if (outcome === "draw") return "It's a draw. Every square on the paper is confirmed.";
    if (session.mode === "replay") return `${outcome} wins. The winning line is confirmed in the recording.`;
    return `${outcome === "X" ? "You win" : "O wins"}. The winning line is confirmed on the paper.`;
  }
  if (session.mode === "replay") return `Watching ${session.phase === "human" ? "X" : "O"}. Waiting to confirm the next visible move in the recording.`;
  if (session.phase === "draw-ai" && session.pendingMove !== null) {
    return `Draw O in ${cellLabel(session.pendingMove)}, then hold the grid still.`;
  }
  return "Your turn. Draw one X in an empty square, then hold the grid still.";
}

// Builds a nine-cell list filled with the same value.
function emptyNine<T>(value: T): T[] {
  return Array.from({ length: 9 }, () => value);
}

// Appends a numbered event to the session log.
export function addEvent(session: Session, event: Omit<SessionEvent, "id">): Session {
  return {
    ...session,
    events: [...session.events, { ...event, id: `event-${session.events.length + 1}` }],
  };
}

// Clears hold-still tracking after the board changes.
export function resetStability(session: Session): Session {
  return {
    ...session,
    stableFrames: 0,
    stableSince: null,
    candidateKey: null,
    candidateSeenAt: null,
    cellCandidates: emptyNine(null),
    checkingChange: false,
  };
}

// Marks the page as not matching the confirmed board yet.
export function withUnverifiedPage(session: Session): Session {
  return {
    ...session,
    pageMatchesBoard: false,
    outcome: null,
    winningLine: null,
  };
}

// Starts a new play or replay session on an empty grid.
export function createSession(mode: Session["mode"] = "play"): Session {
  return {
    mode,
    board: emptyNine(null),
    recognizedBoard: emptyNine(null),
    cellReadingStartedAt: emptyNine(null),
    phase: "human",
    pendingMove: null,
    outcome: null,
    winningLine: null,
    message: mode === "replay" ? "Reading the grid and opening squares from the recording." : "Start with an empty grid. Draw one X when you are ready.",
    events: [
      {
        id: "event-1",
        at: 0,
        kind: "start",
        message: mode === "replay" ? "Recorded-game verification. Observe legal alternating X and O moves." : "New game. You are X and move first.",
      },
    ],
    stableFrames: 0,
    stableSince: null,
    candidateKey: null,
    candidateSeenAt: null,
    cellCandidates: emptyNine(null),
    lastObservationAt: null,
    paused: false,
    recoveryReason: null,
    checkingChange: false,
    pageMatchesBoard: false,
    boardCheck: "ready",
  };
}

// Stops camera reading and keeps confirmed moves.
export function pauseSession(session: Session): Session {
  if (session.paused) return session;
  return addEvent(
    {
      ...resetStability(withUnverifiedPage(session)),
      paused: true,
      boardCheck: "interrupted",
      message: "Paused. Your confirmed moves are saved.",
    },
    {
      at: session.lastObservationAt ?? 0,
      kind: "pause",
      message: "Camera reading paused.",
    },
  );
}

// Starts camera reading again after a pause.
export function resumeSession(session: Session): Session {
  if (!session.paused) return session;
  return addEvent(
    {
      ...resetStability(session),
      paused: false,
      message: "Reading the paper again. Hold the whole grid still.",
    },
    {
      at: session.lastObservationAt ?? 0,
      kind: "resume",
      message: "Camera reading resumed.",
    },
  );
}

// Asks the player to restore the confirmed board.
export function rejectChange(session: Session, reason: string, at: number): Session {
  const next = {
    ...withUnverifiedPage(session),
    recoveryReason: reason,
    message: reason,
  };
  if (session.recoveryReason === reason) return next;
  return addEvent(next, { at, kind: "recovery", message: reason });
}

// True when a cell candidate has been held long enough.
export function stableCell(candidate: CellCandidate | null, at: number): boolean {
  return !!candidate && candidate.frames >= REQUIRED_STABLE_FRAMES && at - candidate.since >= STABLE_WINDOW_MS;
}

// Holds or rejects while a possible board change settles.
export function checkVisibleChange({ session, reason, at, stable }: { session: Session; reason: string; at: number; stable: boolean }): Session {
  if (stable) return rejectChange(session, reason, at);
  return {
    ...withUnverifiedPage(session),
    checkingChange: true,
    message: session.recoveryReason ?? "Checking a possible board change. Hold the visible squares still.",
  };
}
