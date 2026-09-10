import { getOutcome } from "@shared/board.helpers";
import { hasPendingMove } from "@shared/session.helpers";
import {
  drawOInstruction,
  isInGame,
  isSettingUp,
  type Observation,
  type Outcome,
  type Session,
  type Stage,
} from "../../types";

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

function resolveOutcome(stage: Stage, session: Session): Outcome {
  if (!isInGame(stage)) return null;
  if (session.phase === "finished") return getOutcome(session.board).outcome;
  return session.outcome;
}

function observationUncertain(observation: Observation | null): boolean {
  if (!observation) return false;
  if (observation.quality !== "good") return true;
  return observation.cells.some((cell) => cell.mark === "?");
}

function isUncertain(
  session: Session,
  observation: Observation | null,
): boolean {
  return (
    session.checkingChange ||
    !!session.recoveryReason ||
    observationUncertain(observation)
  );
}

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
    pendingDetected:
      session.pendingMove !== null &&
      session.recognizedBoard[session.pendingMove] === "O",
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

function outcomeTitle(
  mode: Session["mode"],
  outcome: "X" | "O" | "draw",
): string {
  if (mode === "replay") {
    return outcome === "draw"
      ? "The recorded game is a draw."
      : `${outcome} wins the recorded game.`;
  }
  if (outcome === "draw") return "It’s a draw.";
  if (outcome === "O") return "Paperplay wins.";
  return "You win.";
}

function copyForOutcome(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.outcome) return null;
  return {
    title: outcomeTitle(ctx.mode, ctx.outcome),
    guidance: "Game over.",
    symbol: ctx.outcome === "X" ? "x" : "o",
  };
}

function copyForRestart(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.needsRestart) return null;
  return {
    title: "Let’s reconnect.",
    guidance: ctx.error || "Start a new session to reconnect the camera.",
    symbol: "eye",
  };
}

function copyForDetecting(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.stage !== "detecting") return null;
  return {
    title: "Reading your board…",
    guidance: ctx.detectionHint || "Keep the whole grid visible.",
    symbol: "eye",
  };
}

function copyForSettingUp(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.settingUp) return null;
  return {
    title: ctx.error ? "Let’s get a clearer view." : "Reading your board…",
    guidance: ctx.error
      ? "Show the grid, then tap refresh."
      : "Grid found. Hold still briefly.",
    symbol: "eye",
  };
}

function copyForPaused(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.paused) return null;
  return {
    title: "Paused.",
    guidance: ctx.error || "Resume when your page is ready.",
    symbol: "pause",
  };
}

function copyForReplay(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.mode !== "replay") return null;
  return {
    title: `Watching ${ctx.phase === "human" ? "X" : "O"}.`,
    guidance: ctx.message,
    symbol: "eye",
  };
}

function copyForRecovery(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.recoveryReason) return null;
  return {
    title: "This move needs correcting.",
    guidance: ctx.recoveryReason,
    symbol: "warning",
  };
}

function hasVisibleNewX(ctx: NextActionContext): boolean {
  return (
    ctx.observation?.cells.some(
      (cell, index) =>
        cell.readable === true &&
        cell.mark === "X" &&
        ctx.board[index] === null,
    ) === true
  );
}

function copyForGuidedHuman(ctx: NextActionContext): NextActionCopy | null {
  if (ctx.phase !== "human") return null;
  const visibleX = hasVisibleNewX(ctx);
  return {
    title: "Your turn. Draw X.",
    guidance:
      ctx.recoveryReason ??
      (visibleX ? "Hold your X still briefly." : "Choose an empty square."),
    symbol: "x",
  };
}

function copyForUncertain(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.uncertain) return null;
  return {
    title: "A clearer view, please.",
    guidance: ctx.recoveryReason || ctx.message,
    symbol: "eye",
  };
}

function copyForReading(ctx: NextActionContext): NextActionCopy | null {
  if (!ctx.reading) return null;
  return {
    title: "Reading the paper…",
    guidance: ctx.needsBoardCheck
      ? ctx.message
      : "Hold the page still for a moment.",
    symbol: "eye",
  };
}

function copyForPending(ctx: NextActionContext): NextActionCopy | null {
  if (!hasPendingMove(ctx)) return null;
  return {
    title: ctx.pendingDetected
      ? "O detected."
      : drawOInstruction(ctx.pendingMove!),
    guidance: ctx.pendingDetected
      ? "O detected. Updating the turn."
      : (ctx.recoveryReason ?? "Draw O in the marked square."),
    symbol: "o",
  };
}

const COPY_WRITERS = [
  copyForOutcome,
  copyForRestart,
  copyForDetecting,
  copyForSettingUp,
  copyForPaused,
  copyForReplay,
  copyForPending,
  copyForGuidedHuman,
  copyForRecovery,
  copyForUncertain,
  copyForReading,
];

export function nextActionCopy(game: NextActionSource): NextActionCopy {
  const ctx = readContext(game);
  for (const write of COPY_WRITERS) {
    const copy = write(ctx);
    if (copy) return copy;
  }
  return DEFAULT_COPY;
}

export function nextActionNeedsAttention(game: NextActionSource): boolean {
  const ctx = readContext(game);
  if (ctx.outcome) return false;
  if (ctx.needsRestart) return true;
  if (hasPendingMove(ctx) || ctx.phase === "human")
    return Boolean(ctx.recoveryReason);
  return !ctx.settingUp && ctx.uncertain && !ctx.paused;
}

export function nextActionShowsNewGame(game: NextActionSource): boolean {
  const ctx = readContext(game);
  return Boolean(ctx.outcome || ctx.needsRestart);
}

export function nextActionNewGameLabel(game: NextActionSource): string {
  const ctx = readContext(game);
  return ctx.outcome && ctx.mode === "play" ? "Play again" : "New session";
}
