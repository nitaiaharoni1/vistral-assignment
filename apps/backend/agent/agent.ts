import { randomUUID, createHash } from "node:crypto";
import { analyze, model } from "./analyze";
import { persist, state, type SavedGame } from "../storage/storage";
import { acceptAnalysis, preservePendingMove } from "./helpers/accept-board";
import {
  captureKey,
  createCaptureFeedback,
  feedbackFor,
  recordCaptureResult,
  completeCaptureFeedback,
} from "./helpers/capture-feedback";
import { withinWindow } from "../http/rate-limit";
import { parseAnalysis, type AgentReply } from "../../../shared/agent-protocol";
import {
  addEvent,
  createSession,
  instruction,
} from "../../../shared/session.helpers";
import { resumeBoard } from "../../../shared/accept-session";
import { checkLegality } from "../../../shared/board.helpers";
import type { Board, Session } from "../../../shared/types";

const busy = new Set<string>();
const budget = Number(process.env.AGENT_BUDGET_USD || 1);
const RESERVATION = 0.015;
const ANALYZE_WINDOW_MS = 60000;
const MAX_ANALYZES_PER_WINDOW = 20;
const MIN_ANALYZE_GAP_MS = 1500;
const MAX_CALLS_PER_GAME = 80;
const lastRequests: number[] = [];

export function resetAnalyzeGate() {
  lastRequests.length = 0;
  busy.clear();
}

export function createGame(profile: string): AgentReply {
  const sessionId = randomUUID();
  const key = captureKey(profile);
  const reply: AgentReply = {
    sessionId,
    revision: 0,
    session: createSession(),
    analysis: null,
    status: "ready",
    message: "Hold the board still for a moment.",
    model,
    decisionSource: "saved",
    latencyMs: 0,
    costUsd: 0,
    learnedExamples: state.examples[profile]?.length ?? 0,
    feedback: createCaptureFeedback(key),
  };
  state.games[sessionId] = {
    reply,
    profile,
    captureKey: key,
    initialized: false,
    calls: 0,
    lastCallAt: 0,
    lastImage: null,
    lastRequestId: null,
  };
  return reply;
}

export function gameFor(id: string) {
  const game = Object.hasOwn(state.games, id) ? state.games[id] : undefined;
  if (!game) throw new Error("This session has expired. Start a new game.");
  return game;
}

function rateLimited(game: SavedGame, now: number): boolean {
  return (
    !withinWindow(
      lastRequests,
      now,
      ANALYZE_WINDOW_MS,
      MAX_ANALYZES_PER_WINDOW,
    ) ||
    now - game.lastCallAt < MIN_ANALYZE_GAP_MS ||
    game.calls >= MAX_CALLS_PER_GAME
  );
}

function overBudget(): boolean {
  return (
    !Number.isFinite(budget) ||
    budget <= 0 ||
    state.spent + RESERVATION > budget
  );
}

function gateAnalyze(id: string, revision: number, requestId: string) {
  const game = gameFor(id);
  if (game.lastRequestId === requestId) return { game, replay: true as const };
  if (busy.has(id)) throw new Error("A board check is already running.");
  if (revision !== game.reply.revision)
    throw new Error("The game changed. Check the board again.");
  if (game.reply.session.phase === "finished")
    return { game, replay: true as const };
  const now = Date.now();
  if (rateLimited(game, now))
    throw new Error("Please wait a moment before checking again.");
  if (overBudget())
    throw new Error("The configured analysis budget has been reached.");
  return { game, replay: false as const, now };
}

function applyModelResult(
  game: SavedGame,
  revision: number,
  requestId: string,
  image: string,
  trigger: "automatic" | "manual" | "unspecified",
  result: Awaited<ReturnType<typeof analyze>>,
): AgentReply {
  const previous = game.reply.session.board;
  state.spent += result.costUsd - RESERVATION;
  game.lastImage = image;
  game.reply = {
    ...game.reply,
    notice: null,
    ...acceptAnalysis(game, result.analysis),
    analysis: result.analysis,
    revision: revision + 1,
    latencyMs: result.latencyMs,
    costUsd: game.reply.costUsd + result.costUsd,
  };
  game.reply.session = addEvent(game.reply.session, {
    at: Date.now(),
    kind: "agent-request",
    message: `Request ${result.providerRequestId}; trigger: ${trigger}; snapshot ${createHash("sha256").update(image).digest("hex").slice(0, 16)}; ${result.latencyMs}ms; $${result.costUsd.toFixed(6)}; ${game.reply.status}.`,
  });
  game.lastRequestId = requestId;
  recordCaptureResult(game, previous, trigger);
  return game.reply;
}

export async function readBoard(
  id: string,
  revision: number,
  requestId: string,
  image: string,
  trigger: "automatic" | "manual" | "unspecified" = "unspecified",
): Promise<AgentReply> {
  const gated = gateAnalyze(id, revision, requestId);
  if (gated.replay) return gated.game.reply;
  const { game, now } = gated;
  busy.add(id);
  lastRequests.push(now);
  game.lastCallAt = now;
  game.calls++;
  state.spent += RESERVATION;
  try {
    await persist();
    const result = await analyze(
      image,
      game.reply.session.board,
      game.reply.session.pendingMove,
      state.examples[game.profile] ?? [],
    ).catch(async (error: unknown) => {
      feedbackFor(game).failedChecks++;
      await persist();
      throw error;
    });
    const reply = applyModelResult(
      game,
      revision,
      requestId,
      image,
      trigger,
      result,
    );
    await persist();
    return reply;
  } finally {
    busy.delete(id);
  }
}

function correctedSession(previous: Session, board: Board): Session {
  let session = preservePendingMove(resumeBoard(board), previous);
  session = { ...session, pageMatchesBoard: true, events: previous.events };
  session = addEvent(session, {
    at: Date.now(),
    kind: "user-correction",
    board: [...board],
    message:
      "User explicitly corrected the photographed board. Example saved for this browser's future games.",
  });
  return { ...session, message: instruction(session) };
}

function rememberExample(game: SavedGame, board: Board) {
  const examples = state.examples[game.profile] ?? [];
  state.examples[game.profile] = [
    ...examples,
    { image: game.lastImage!, board: [...board], at: new Date().toISOString() },
  ].slice(-2);
}

function correctionReply(
  game: SavedGame,
  session: Session,
  revision: number,
): AgentReply {
  game.initialized = true;
  game.reply = {
    ...game.reply,
    session,
    revision: revision + 1,
    analysis: parseAnalysis({
      cells: boardCells(session),
      clear: true,
      reason: "User-corrected reading",
    }),
    status: "ready",
    message: session.message,
    decisionSource: "rules",
    learnedExamples: state.examples[game.profile].length,
    notice: null,
  };
  return game.reply;
}

function boardCells(session: Session) {
  return session.board.map((mark) => ({
    mark: mark ?? "empty",
    confidence: 1,
  }));
}

export async function correctReading(
  id: string,
  revision: number,
  board: Board,
): Promise<AgentReply> {
  const game = gameFor(id);
  if (busy.has(id) || game.reply.revision !== revision || !game.lastImage)
    throw new Error("Check the board first, then correct that reading.");
  const legal = checkLegality(board);
  if (!legal.valid) throw new Error(legal.reason);
  const feedback = feedbackFor(game);
  if (!feedback.completedAt) feedback.corrections++;
  const session = correctedSession(game.reply.session, board);
  rememberExample(game, board);
  const reply = correctionReply(game, session, revision);
  completeCaptureFeedback(game);
  await persist();
  return reply;
}
