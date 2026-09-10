import { getOutcome } from "@shared/board-helpers/board.helpers";
import { hasPendingMove } from "@shared/session-helpers/session.helpers";
import { drawOInstruction } from "../../types";
import { isInGame } from "../../types";
import { isSettingUp } from "../../types";
import type { Observation } from "../../types";
import type { Outcome } from "../../types";
import type { Session } from "../../types";
import type { Stage } from "../../types";

export type NextActionSymbol = "x" | "o" | "eye" | "pause" | "warning";

export type NextActionCopy = {
  title: string;
  guidance: string;
  symbol: NextActionSymbol;
};

export type NextActionSource = {
  stage: Stage;
  needsRestart: boolean;
  error: string;
  detectionHint: string;
  session: Session;
  observation: Observation | null;
};

type NextActionContext = {
  outcome: Outcome;
  needsRestart: boolean;
  error: string;
  detectionHint: string;
  stage: Stage;
  settingUp: boolean;
  paused: boolean;
  mode: Session["mode"];
  recoveryReason: string | null;
  pendingMove: number | null;
  pendingDetected: boolean;
  phase: Session["phase"];
  uncertain: boolean;
  reading: boolean;
  pageMatchesBoard: boolean;
  needsBoardCheck: boolean;
  message: string;
  observation: Observation | null;
  board: Session["board"];
};

const DEFAULT_COPY: NextActionCopy = {
  title: "Your move.",
  guidance: "Draw X in an empty square.",
  symbol: "x",
};

// Returns the finished or live outcome when in a game.
function resolveOutcome(stage: Stage, session: Session): Outcome {
  if (!isInGame(stage)) return null;
  if (session.phase === "finished") return getOutcome(session.board).outcome;
  return session.outcome;
}

// True when the frame quality or a cell is unclear.
function observationUncertain(observation: Observation | null): boolean {
  if (!observation) return false;
  if (observation.quality !== "good") return true;
  return observation.cells.some((cell) => cell.mark === "?");
}

// True when recovery, checking, or a fuzzy observation is active.
function isUncertain(session: Session, observation: Observation | null): boolean {
  return session.checkingChange || !!session.recoveryReason || observationUncertain(observation);
}

// Flattens game fields the copy writers need.
function readContext(game: NextActionSource): NextActionContext {
  const { session, stage, observation } = game;
  const settingUp = isSettingUp(stage);
  return {
    outcome: resolveOutcome(stage, session),
    needsRestart: game.needsRestart,
    error: game.error,
    detectionHint: game.detectionHint,
    stage,
    settingUp,
    paused: session.paused,
    mode: session.mode,
    recoveryReason: session.recoveryReason,
    pendingMove: session.pendingMove,
    pendingDetected: session.pendingMove !== null && session.recognizedBoard[session.pendingMove] === "O",
    phase: session.phase,
    uncertain: isUncertain(session, observation),
    reading: !settingUp && !session.pageMatchesBoard,
    pageMatchesBoard: session.pageMatchesBoard,
    needsBoardCheck: session.boardCheck !== "ready",
    message: session.message,
    observation,
    board: session.board,
  };
}

// Writes the win or draw title for play or replay.
function outcomeTitle(mode: Session["mode"], outcome: "X" | "O" | "draw"): string {
  if (mode === "replay") {
    return outcome === "draw" ? "The recorded game is a draw." : `${outcome} wins the recorded game.`;
  }
  if (outcome === "draw") return "It’s a draw.";
  if (outcome === "O") return "Paperplay wins.";
  return "You win.";
}

// Copy for a finished game result.
function copyForOutcome(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.outcome) return null;
  return {
    title: outcomeTitle(ctx.mode, ctx.outcome),
    guidance: "Game over.",
    symbol: ctx.outcome === "X" ? "x" : "o",
  };
}

// Copy when the camera session must restart.
function copyForRestart(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.needsRestart) return null;
  return {
    title: "Let’s reconnect.",
    guidance: ctx.error || "Start a new session to reconnect the camera.",
    symbol: "eye",
  };
}

// Copy while the board outline is being found.
function copyForDetecting(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.stage !== "detecting") return null;
  return {
    title: "Reading your board…",
    guidance: ctx.detectionHint || "Keep the whole grid visible.",
    symbol: "eye",
  };
}

// Copy while the found grid is being confirmed.
function copyForSettingUp(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.settingUp) return null;
  return {
    title: ctx.error ? "Let’s get a clearer view." : "Reading your board…",
    guidance: ctx.error ? "Show the grid, then tap refresh." : "Grid found. Hold still briefly.",
    symbol: "eye",
  };
}

// Copy while the camera is paused.
function copyForPaused(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.paused) return null;
  return {
    title: "Paused.",
    guidance: ctx.error || "Resume when your page is ready.",
    symbol: "pause",
  };
}

// Copy while a recorded game is playing back.
function copyForReplay(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.mode !== "replay") return null;
  return {
    title: `Watching ${ctx.phase === "human" ? "X" : "O"}.`,
    guidance: ctx.message,
    symbol: "eye",
  };
}

// Copy when a move needs to be corrected.
function copyForRecovery(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.recoveryReason) return null;
  return {
    title: "This move needs correcting.",
    guidance: ctx.recoveryReason,
    symbol: "warning",
  };
}

// True when a new unread X is already on the paper.
function hasVisibleNewX(ctx: NextActionContext): boolean {
  return ctx.observation?.cells.some((cell, index) => cell.readable === true && cell.mark === "X" && ctx.board[index] === null) === true;
}

// Copy that asks the person to draw X.
function copyForGuidedHuman(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.phase !== "human") return null;
  const visibleX = hasVisibleNewX(ctx);
  return {
    title: "Your turn. Draw X.",
    guidance: ctx.recoveryReason ?? (visibleX ? "Hold your X still briefly." : "Choose an empty square."),
    symbol: "x",
  };
}

// Copy that asks for a clearer camera view.
function copyForUncertain(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.uncertain) return null;
  return {
    title: "A clearer view, please.",
    guidance: ctx.recoveryReason || ctx.message,
    symbol: "eye",
  };
}

// Copy while the paper is being matched to the board.
function copyForReading(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.reading) return null;
  return {
    title: "Reading the paper…",
    guidance: ctx.needsBoardCheck ? ctx.message : "Hold the page still for a moment.",
    symbol: "eye",
  };
}

// Copy that asks for O or confirms it was seen.
function copyForPending(ctx: NextActionContext): NextActionCopy | null {
  if (!hasPendingMove(ctx)) return null;
  return {
    title: ctx.pendingDetected ? "O detected." : drawOInstruction(ctx.pendingMove!),
    guidance: ctx.pendingDetected ? "O detected. Updating the turn." : (ctx.recoveryReason ?? "Draw O in the marked square."),
    symbol: "o",
  };
}

const COPY_WRITERS = [copyForOutcome, copyForRestart, copyForDetecting, copyForSettingUp, copyForPaused, copyForReplay, copyForPending, copyForGuidedHuman, copyForRecovery, copyForUncertain, copyForReading];

// Picks the first matching next-action copy.
export function nextActionCopy(game: NextActionSource): NextActionCopy {
  const ctx = readContext(game);
  for (const write of COPY_WRITERS) {
    const copy = write(ctx);
    if (copy) return copy;
  }
  return DEFAULT_COPY;
}

// True when the next action needs extra attention.
export function nextActionNeedsAttention(game: NextActionSource): boolean {
  const ctx = readContext(game);
  if (ctx.outcome) return false;
  if (ctx.needsRestart) return true;
  if (hasPendingMove(ctx) || ctx.phase === "human") return Boolean(ctx.recoveryReason);
  return !ctx.settingUp && ctx.uncertain && !ctx.paused;
}

// True when a new-game button should appear.
export function nextActionShowsNewGame(game: NextActionSource): boolean {
  const ctx = readContext(game);
  return Boolean(ctx.outcome || ctx.needsRestart);
}

// Labels the new-game button Play again or New session.
export function nextActionNewGameLabel(game: NextActionSource): string {
  const ctx = readContext(game);
  return ctx.outcome && ctx.mode === "play" ? "Play again" : "New session";
}
