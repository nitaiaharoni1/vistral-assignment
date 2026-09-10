import type { Board } from "../types";
import type { Session } from "../types";

export { GAME_AGENT_API_BASE, GAME_AGENT_API_PATH } from "./game-agent-api";

export const ANALYZE_TRIGGERS = ["automatic", "manual"] as const;
export type AnalyzeTrigger = (typeof ANALYZE_TRIGGERS)[number];

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SESSION_EVENT_KINDS = new Set([
  "start",
  "board-imported",
  "human-move",
  "ai-confirmed",
  "observed-move",
  "ai-intent",
  "ai-placement-changed",
  "result",
  "recovery",
  "recovered",
  "board-sync",
  "pause",
  "resume",
  "user-correction",
  "agent-request",
  "agent-analysis",
  "capture-feedback",
]);

// True when the value is a lowercase UUID string.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type VisibleMark = "X" | "O" | "empty" | "unknown";
export type BoardAnalysis = {
  cells: { mark: VisibleMark; confidence: number }[];
  clear: boolean;
  reason: string;
};
export const DEFAULT_CAPTURE_STABLE_MS = 300;
export type CaptureFeedback = {
  algorithm: "capture-timing-v1";
  memoryVersion: number;
  stableMs: number;
  automaticChecks: number;
  unclearChecks: number;
  rejectedChecks: number;
  manualChecks: number;
  failedChecks: number;
  corrections: number;
  confirmedMoves: number;
  totalLatencyMs: number;
  completedAt: string | null;
  nextStableMs: number | null;
  updateReason: string | null;
};
export type GameAgentReply = {
  sessionId: string;
  revision: number;
  session: Session;
  analysis: BoardAnalysis | null;
  status: "ready" | "uncertain" | "rejected";
  message: string;
  model: string;
  decisionSource: "rules" | "saved";
  latencyMs: number;
  costUsd: number;
  learnedExamples: number;
  feedback?: CaptureFeedback;
  notice?: string | null;
};

export type CreateSessionRequest = {
  profile?: string;
};

export type SessionRequest = {
  sessionId: string;
  revision: number;
};

export type AnalyzeRequest = SessionRequest & {
  requestId: string;
  image: string;
  trigger?: AnalyzeTrigger;
};

export type FeedbackRequest = SessionRequest & {
  board: Board;
};

export type GameAgentStatusReply = {
  configured: boolean;
  model: string;
};

export type GameAgentErrorReply = {
  error: string;
};

export type GameAgentRoutes = {
  sessions: { request: CreateSessionRequest; response: GameAgentReply };
  sync: { request: SessionRequest; response: GameAgentReply };
  analyze: { request: AnalyzeRequest; response: GameAgentReply };
  feedback: { request: FeedbackRequest; response: GameAgentReply };
};

// True when the payload is an agent error object.
export function isGameAgentErrorReply(value: unknown): value is GameAgentErrorReply {
  return !!value && typeof value === "object" && "error" in value && typeof value.error === "string";
}

// True when the payload contains a complete agent reply.
export function isGameAgentReply(value: unknown): value is GameAgentReply {
  if (!isRecord(value)) return false;
  return hasReplyIdentity(value) && hasReplyContent(value) && hasReplyMetrics(value);
}

function hasReplyIdentity(value: Record<string, unknown>): boolean {
  return isUuid(value.sessionId) && isNonNegativeInteger(value.revision) && isSession(value.session);
}

function hasReplyContent(value: Record<string, unknown>): boolean {
  return (
    (value.analysis === null || isBoardAnalysis(value.analysis)) &&
    (value.status === "ready" || value.status === "uncertain" || value.status === "rejected") &&
    typeof value.message === "string" &&
    typeof value.model === "string" &&
    (value.decisionSource === "rules" || value.decisionSource === "saved")
  );
}

function hasReplyMetrics(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeNumber(value.latencyMs) &&
    isNonNegativeNumber(value.costUsd) &&
    isNonNegativeInteger(value.learnedExamples) &&
    (value.feedback === undefined || isCaptureFeedback(value.feedback)) &&
    (value.notice === undefined || value.notice === null || typeof value.notice === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeNumber(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length === 9 && value.every((mark) => mark === null || mark === "X" || mark === "O");
}

function isBoardAnalysis(value: unknown): value is BoardAnalysis {
  if (!isRecord(value) || !Array.isArray(value.cells) || value.cells.length !== 9) return false;
  return (
    value.cells.every(
      (cell) => isRecord(cell) && (cell.mark === "X" || cell.mark === "O" || cell.mark === "empty" || cell.mark === "unknown") && typeof cell.confidence === "number" && Number.isFinite(cell.confidence) && cell.confidence >= 0 && cell.confidence <= 1,
    ) &&
    typeof value.clear === "boolean" &&
    typeof value.reason === "string"
  );
}

function isCaptureFeedback(value: unknown): value is CaptureFeedback {
  if (!isRecord(value)) return false;
  const counters = ["memoryVersion", "stableMs", "automaticChecks", "unclearChecks", "rejectedChecks", "manualChecks", "failedChecks", "corrections", "confirmedMoves", "totalLatencyMs"];
  return (
    value.algorithm === "capture-timing-v1" &&
    counters.every((key) => isNonNegativeNumber(value[key])) &&
    isNullableString(value.completedAt) &&
    (value.nextStableMs === null || isNonNegativeNumber(value.nextStableMs)) &&
    isNullableString(value.updateReason)
  );
}

function isSession(value: unknown): value is Session {
  if (!isRecord(value)) return false;
  return hasSessionBoard(value) && hasSessionProgress(value) && hasSessionTracking(value) && hasSessionStatus(value);
}

function hasSessionBoard(value: Record<string, unknown>): boolean {
  return (value.mode === "play" || value.mode === "replay") && isBoard(value.board) && isBoard(value.recognizedBoard) && isNullableNumberList(value.cellReadingStartedAt, 9);
}

function hasSessionProgress(value: Record<string, unknown>): boolean {
  return (
    (value.phase === "human" || value.phase === "draw-ai" || value.phase === "finished") &&
    (value.pendingMove === null || isCell(value.pendingMove)) &&
    (value.outcome === null || value.outcome === "X" || value.outcome === "O" || value.outcome === "draw") &&
    (value.winningLine === null || (Array.isArray(value.winningLine) && value.winningLine.length === 3 && value.winningLine.every(isCell)))
  );
}

function hasSessionTracking(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeInteger(value.stableFrames) &&
    isNullableNumber(value.stableSince) &&
    isNullableString(value.candidateKey) &&
    isNullableNumber(value.candidateSeenAt) &&
    Array.isArray(value.cellCandidates) &&
    value.cellCandidates.length === 9 &&
    value.cellCandidates.every((candidate) => candidate === null || isCellCandidate(candidate)) &&
    isNullableNumber(value.lastObservationAt)
  );
}

function hasSessionStatus(value: Record<string, unknown>): boolean {
  return (
    typeof value.message === "string" &&
    Array.isArray(value.events) &&
    value.events.every(isSessionEvent) &&
    typeof value.paused === "boolean" &&
    isNullableString(value.recoveryReason) &&
    typeof value.checkingChange === "boolean" &&
    (value.boardCheck === "ready" || value.boardCheck === "interrupted" || value.boardCheck === "finding-grid" || value.boardCheck === "verifying-grid") &&
    typeof value.pageMatchesBoard === "boolean"
  );
}

function isCell(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value < 9;
}

function isNullableNumberList(value: unknown, length: number): value is (number | null)[] {
  return Array.isArray(value) && value.length === length && value.every(isNullableNumber);
}

function isCellCandidate(value: unknown): boolean {
  return isRecord(value) && (value.mark === null || value.mark === "X" || value.mark === "O") && isNonNegativeInteger(value.frames) && isNonNegativeNumber(value.since) && isNonNegativeNumber(value.lastSeen);
}

function isSessionEvent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isNonNegativeNumber(value.at) &&
    typeof value.kind === "string" &&
    SESSION_EVENT_KINDS.has(value.kind) &&
    typeof value.message === "string" &&
    (value.cell === undefined || isCell(value.cell)) &&
    (value.mark === undefined || value.mark === "X" || value.mark === "O") &&
    (value.board === undefined || isBoard(value.board))
  );
}
