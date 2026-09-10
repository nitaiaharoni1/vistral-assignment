import { Injectable } from "@nestjs/common";
import { DEFAULT_CAPTURE_STABLE_MS } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentReply } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { BoardAnalysis } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { CaptureFeedback } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import { acceptStableBoard } from "../../../../../shared/accept-session/accept-session";
import { resumeBoard } from "../../../../../shared/accept-session/accept-session";
import { addedCells } from "../../../../../shared/board-helpers/board.helpers";
import { checkLegality } from "../../../../../shared/board-helpers/board.helpers";
import { sameBoard } from "../../../../../shared/board-helpers/board.helpers";
import { addEvent } from "../../../../../shared/session-helpers/session.helpers";
import { cellLabel } from "../../../../../shared/session-helpers/session.helpers";
import { hasPendingMove } from "../../../../../shared/session-helpers/session.helpers";
import { instruction } from "../../../../../shared/session-helpers/session.helpers";
import { CELL_NAMES } from "../../../../../shared/types";
import type { Board } from "../../../../../shared/types";
import type { Session } from "../../../../../shared/types";
import type { CaptureMemory } from "../game-agent-storage/game-agent-storage.service";
import type { SavedGame } from "../game-agent-storage/game-agent-storage.service";

const MIN_CELL_CONFIDENCE = 0.85;

type Reader = { model: string; promptVersion: string };

type AnalysisUpdate = Pick<GameAgentReply, "session" | "status" | "message" | "decisionSource" | "notice">;

@Injectable()
export class GameAgentBoardService {
  // Keys capture timing by player, model, and prompt.
  public captureKey(profile: string, model: string, promptVersion: string): string {
    return JSON.stringify([profile, model, promptVersion, "capture-timing-v1"]);
  }

  // Starts empty capture stats, using saved timing when present.
  public createCaptureFeedback(memory?: CaptureMemory): CaptureFeedback {
    return {
      algorithm: "capture-timing-v1",
      memoryVersion: memory?.version ?? 0,
      stableMs: memory?.stableMs ?? DEFAULT_CAPTURE_STABLE_MS,
      automaticChecks: 0,
      unclearChecks: 0,
      rejectedChecks: 0,
      manualChecks: 0,
      failedChecks: 0,
      corrections: 0,
      confirmedMoves: 0,
      totalLatencyMs: 0,
      completedAt: null,
      nextStableMs: null,
      updateReason: null,
    };
  }

  // Returns the game's capture stats, creating them if needed.
  public feedbackFor(game: SavedGame): CaptureFeedback {
    return (game.reply.feedback ??= this.createCaptureFeedback());
  }

  // Counts this check and may finish timing once the game ends.
  public recordCaptureResult(input: { game: SavedGame; previous: Board; trigger: "automatic" | "manual" | "unspecified"; profiles: Record<string, CaptureMemory>; reader: Reader }) {
    const feedback = this.feedbackFor(input.game);
    if (feedback.completedAt) return;
    countCaptureCheck(feedback, input.trigger, input.game.reply.status);
    countConfirmedMoves(feedback, input.previous, input.game.reply);
    feedback.totalLatencyMs += input.game.reply.latencyMs;
    this.completeCaptureFeedback(input.game, input.profiles, input.reader);
  }

  // Saves hold-still timing after a finished game.
  public completeCaptureFeedback(game: SavedGame, profiles: Record<string, CaptureMemory>, reader: Reader) {
    const feedback = this.feedbackFor(game);
    if (feedback.completedAt || game.reply.session.phase !== "finished") return;
    feedback.completedAt = new Date().toISOString();
    const key = (game.captureKey ??= this.captureKey(game.profile, reader.model, reader.promptVersion));
    const previous = profiles[key];
    const [stableMs, reason] = nextCaptureTiming(feedback, previous);
    feedback.nextStableMs = stableMs;
    feedback.updateReason = reason;
    saveCaptureMemory({
      profiles,
      key,
      previous,
      game,
      feedback,
      stableMs,
    });
    game.reply.session = addEvent(game.reply.session, {
      at: Date.now(),
      kind: "capture-feedback",
      message: captureFeedbackMessage(feedback, stableMs, reason),
    });
  }

  // Records a correction, including one made after timing was saved.
  public recordCaptureCorrection(game: SavedGame, profiles: Record<string, CaptureMemory>, reader: Reader) {
    const feedback = this.feedbackFor(game);
    feedback.corrections++;
    if (!feedback.completedAt) return;
    const key = (game.captureKey ??= this.captureKey(game.profile, reader.model, reader.promptVersion));
    const saved = profiles[key];
    if (!saved || saved.lastSessionId !== game.reply.sessionId) {
      feedback.nextStableMs = saved?.stableMs ?? feedback.stableMs;
      feedback.updateReason = "Correction recorded after timing was saved; newer profile timing was kept.";
      return;
    }
    const [stableMs, reason] = chooseTiming(feedback);
    feedback.nextStableMs = stableMs;
    feedback.updateReason = reason;
    profiles[key] = {
      ...saved,
      stableMs,
      lastResult: { ...feedback },
    };
  }

  // Keeps the prior pending O when the board did not change.
  public preservePendingMove(session: Session, previous: Session): Session {
    if (previous.pendingMove !== null && sameBoard(previous.board, session.board)) return { ...session, pendingMove: previous.pendingMove };
    return session;
  }

  // Holds, rejects, or accepts a model reading.
  public acceptAnalysis(game: SavedGame, analysis: BoardAnalysis, reader: Reader): AnalysisUpdate {
    const current = game.reply.session;
    if (unclear(analysis)) return hold(current, "uncertain", "Keep the whole board clear and still, then try again.");
    const board = observedBoard(analysis);
    const legal = checkLegality(board);
    if (!legal.valid) return hold(current, "rejected", legal.reason);
    return this.applyAccepted({ game, current, board, reader });
  }

  // Chooses saved or rules as the decision source.
  private replySource(next: Session, previous: Session): { session: Session; source: GameAgentReply["decisionSource"] } {
    if (next.phase !== "draw-ai" || next.mode !== "play") return { session: next, source: "saved" };
    if (previous.pendingMove !== null && sameBoard(previous.board, next.board))
      return {
        session: this.preservePendingMove(next, previous),
        source: "saved",
      };
    return { session: next, source: "rules" };
  }

  // Applies the first or later accepted board to the game.
  private applyAccepted(input: { game: SavedGame; current: Session; board: Board; reader: Reader }): AnalysisUpdate {
    const accepted = input.game.initialized
      ? acceptPaperBoard(input.current, input.board)
      : {
          session: { ...resumeBoard(input.board), pageMatchesBoard: true },
          notice: null,
        };
    if (accepted.session.recoveryReason) return hold(input.current, "rejected", accepted.session.recoveryReason);
    input.game.initialized = true;
    const selected = this.replySource(accepted.session, input.current);
    const next = addEvent(selected.session, {
      at: Date.now(),
      kind: "agent-analysis",
      message: `${input.reader.model}; ${input.reader.promptVersion}; decision: ${selected.source}; snapshot confirmed.`,
      board: [...input.board],
    });
    return {
      session: next,
      status: "ready",
      message: accepted.notice ?? instruction(next),
      notice: accepted.notice,
      decisionSource: selected.source,
    };
  }
}

// Counts automatic, manual, unclear, and rejected capture checks.
function countCaptureCheck(feedback: CaptureFeedback, trigger: "automatic" | "manual" | "unspecified", status: GameAgentReply["status"]) {
  if (trigger === "automatic") {
    feedback.automaticChecks++;
    if (status === "uncertain") feedback.unclearChecks++;
    if (status === "rejected") feedback.rejectedChecks++;
  } else if (trigger === "manual") feedback.manualChecks++;
}

// Adds ready-status cells to the confirmed-move count.
function countConfirmedMoves(feedback: CaptureFeedback, previous: Board, reply: GameAgentReply) {
  if (reply.status === "ready") feedback.confirmedMoves += addedCells(previous, reply.session.board).length;
}

// Picks next hold-still time, keeping a newer saved timing.
function nextCaptureTiming(feedback: CaptureFeedback, previous?: CaptureMemory): [number, string] {
  let [stableMs, reason] = chooseTiming(feedback);
  if ((previous?.version ?? 0) !== feedback.memoryVersion) {
    stableMs = previous?.stableMs ?? DEFAULT_CAPTURE_STABLE_MS;
    reason = "Kept newer timing: another completed game updated this profile.";
  }
  return [stableMs, reason];
}

// Writes this game's capture timing onto the profile.
function saveCaptureMemory(input: { profiles: Record<string, CaptureMemory>; key: string; previous: CaptureMemory | undefined; game: SavedGame; feedback: CaptureFeedback; stableMs: number }) {
  input.profiles[input.key] = {
    version: (input.previous?.version ?? 0) + 1,
    stableMs: input.stableMs,
    completedGames: (input.previous?.completedGames ?? 0) + 1,
    lastSessionId: input.game.reply.sessionId,
    lastResult: { ...input.feedback },
  };
}

// Builds the capture-feedback event line.
function captureFeedbackMessage(feedback: CaptureFeedback, stableMs: number, reason: string): string {
  return `Automatic capture feedback saved: ${feedback.unclearChecks}/${feedback.automaticChecks} unclear readings; ${feedback.stableMs} ms used, ${stableMs} ms for the next game. ${reason}`;
}

// Picks the next hold-still time from how this game was captured.
function chooseTiming(feedback: CaptureFeedback): [number, string] {
  if (feedback.corrections > 0) return [feedback.stableMs, "Kept timing: this game includes manual corrections."];
  if (feedback.automaticChecks < 6 || feedback.confirmedMoves < 3) return [feedback.stableMs, "Kept timing: insufficient automatic game evidence."];
  if (feedback.rejectedChecks > 0 || feedback.failedChecks > 0) return [feedback.stableMs, "Kept timing: rejected readings or request failures need review."];
  if (feedback.unclearChecks / feedback.automaticChecks >= 0.25) return [Math.min(900, feedback.stableMs + 100), "Wait up to 100 ms longer: at least a quarter of automatic readings were unclear."];
  if (feedback.unclearChecks === 0) return [Math.max(DEFAULT_CAPTURE_STABLE_MS, feedback.stableMs - 100), "Reduce extra waiting by up to 100 ms: all automatic readings were clear."];
  return [feedback.stableMs, "Kept timing: mixed evidence."];
}

// Returns a saved-source hold with an uncertain or rejected status.
function hold(session: Session, status: "uncertain" | "rejected", message: string): AnalysisUpdate {
  return { session, status, message, decisionSource: "saved" };
}

// True when the reading is blurry, unknown, or low confidence.
function unclear(analysis: BoardAnalysis): boolean {
  return !analysis.clear || analysis.cells.some((cell) => cell.mark === "unknown" || cell.confidence < MIN_CELL_CONFIDENCE);
}

// Converts analysis cells into a board of X, O, or empty.
function observedBoard(analysis: BoardAnalysis): Board {
  return analysis.cells.map((cell) => (cell.mark === "empty" ? null : cell.mark)) as Board;
}

// Accepts a legal photographed board, including a relocated O.
function acceptPaperBoard(current: Session, board: Board): { session: Session; notice: string | null } {
  const additions = addedCells(current.board, board);
  const cell = additions[0];
  const relocated = isRelocatedO(current, board, additions);
  const session = acceptStableBoard(relocated ? { ...current, pendingMove: cell } : current, board, Date.now());
  if (!relocated || session.recoveryReason) return { session, notice: null };
  return relocatedONotice({ current, session, board, cell });
}

// True when the photographed O landed in a different cell.
function isRelocatedO(current: Session, board: Board, additions: number[]): boolean {
  const cell = additions[0];
  return hasPendingMove(current) && additions.length === 1 && board[cell] === "O" && cell !== current.pendingMove;
}

// Records the relocated-O notice and event.
function relocatedONotice(input: { current: Session; session: Session; board: Board; cell: number }): { session: Session; notice: string } {
  const notice = `O was drawn in ${cellLabel(input.cell)} instead of ${cellLabel(input.current.pendingMove!)}. ${instruction(input.session)}`;
  return {
    session: addEvent(
      { ...input.session, message: notice },
      {
        at: Date.now(),
        kind: "ai-placement-changed",
        cell: input.cell,
        mark: "O",
        board: [...input.board],
        message: notice,
      },
    ),
    notice: `O accepted in ${CELL_NAMES[input.cell]}.`,
  };
}
