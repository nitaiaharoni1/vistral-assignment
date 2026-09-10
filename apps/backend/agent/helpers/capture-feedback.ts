import {
  DEFAULT_CAPTURE_STABLE_MS,
  type CaptureFeedback,
} from "../../../../shared/agent-protocol";
import { addedCells } from "../../../../shared/board.helpers";
import { addEvent } from "../../../../shared/session.helpers";
import type { Board } from "../../../../shared/types";
import { model, PROMPT_VERSION } from "../analyze";
import { state, type SavedGame } from "../../storage/storage";

export function captureKey(profile: string): string {
  return JSON.stringify([profile, model, PROMPT_VERSION, "capture-timing-v1"]);
}

export function createCaptureFeedback(key?: string): CaptureFeedback {
  const memory = key ? state.captureProfiles?.[key] : undefined;
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

export function feedbackFor(game: SavedGame): CaptureFeedback {
  // Older in-progress sessions used the default timing, not a learned policy.
  return (game.reply.feedback ??= createCaptureFeedback());
}

export function recordCaptureResult(
  game: SavedGame,
  previous: Board,
  trigger: "automatic" | "manual" | "unspecified",
) {
  const feedback = feedbackFor(game);
  if (feedback.completedAt) return;
  if (trigger === "automatic") {
    feedback.automaticChecks++;
    if (game.reply.status === "uncertain") feedback.unclearChecks++;
    if (game.reply.status === "rejected") feedback.rejectedChecks++;
  } else if (trigger === "manual") feedback.manualChecks++;
  if (game.reply.status === "ready")
    feedback.confirmedMoves += addedCells(
      previous,
      game.reply.session.board,
    ).length;
  feedback.totalLatencyMs += game.reply.latencyMs;
  completeCaptureFeedback(game);
}

function chooseTiming(feedback: CaptureFeedback): [number, string] {
  if (feedback.corrections > 0)
    return [
      feedback.stableMs,
      "Kept timing: this game includes manual corrections.",
    ];
  if (feedback.automaticChecks < 6 || feedback.confirmedMoves < 3)
    return [
      feedback.stableMs,
      "Kept timing: insufficient automatic game evidence.",
    ];
  if (feedback.rejectedChecks > 0 || feedback.failedChecks > 0)
    return [
      feedback.stableMs,
      "Kept timing: rejected readings or request failures need review.",
    ];
  if (feedback.unclearChecks / feedback.automaticChecks >= 0.25)
    return [
      Math.min(900, feedback.stableMs + 100),
      "Wait up to 100 ms longer: at least a quarter of automatic readings were unclear.",
    ];
  if (feedback.unclearChecks === 0)
    return [
      Math.max(DEFAULT_CAPTURE_STABLE_MS, feedback.stableMs - 100),
      "Reduce extra waiting by up to 100 ms: all automatic readings were clear.",
    ];
  return [feedback.stableMs, "Kept timing: mixed evidence."];
}

export function completeCaptureFeedback(game: SavedGame) {
  const feedback = feedbackFor(game);
  if (feedback.completedAt || game.reply.session.phase !== "finished") return;
  feedback.completedAt = new Date().toISOString();
  const key = (game.captureKey ??= captureKey(game.profile));
  const profiles = (state.captureProfiles ??= {});
  const previous = profiles[key];
  let [stableMs, reason] = chooseTiming(feedback);
  if ((previous?.version ?? 0) !== feedback.memoryVersion) {
    stableMs = previous?.stableMs ?? DEFAULT_CAPTURE_STABLE_MS;
    reason = "Kept newer timing: another completed game updated this profile.";
  }
  feedback.nextStableMs = stableMs;
  feedback.updateReason = reason;
  profiles[key] = {
    version: (previous?.version ?? 0) + 1,
    stableMs,
    completedGames: (previous?.completedGames ?? 0) + 1,
    lastSessionId: game.reply.sessionId,
    lastResult: { ...feedback },
  };
  game.reply.session = addEvent(game.reply.session, {
    at: Date.now(),
    kind: "capture-feedback",
    message: `Automatic capture feedback saved: ${feedback.unclearChecks}/${feedback.automaticChecks} unclear readings; ${feedback.stableMs} ms used, ${stableMs} ms for the next game. ${reason}`,
  });
}
