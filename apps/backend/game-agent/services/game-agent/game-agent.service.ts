import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { GameAgentReply } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentStatusReply } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { AnalyzeRequest } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { CreateSessionRequest } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { FeedbackRequest } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { SessionRequest } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import { resumeBoard } from "../../../../../shared/accept-session/accept-session";
import { checkLegality } from "../../../../../shared/board-helpers/board.helpers";
import { addEvent } from "../../../../../shared/session-helpers/session.helpers";
import { createSession } from "../../../../../shared/session-helpers/session.helpers";
import { instruction } from "../../../../../shared/session-helpers/session.helpers";
import type { Board } from "../../../../../shared/types";
import type { Session } from "../../../../../shared/types";
import { parseAnalysis } from "../../helpers/parse-analysis";
import { GameAgentBoardService } from "../game-agent-board/game-agent-board.service";
import { GameAgentStorageService } from "../game-agent-storage/game-agent-storage.service";
import type { SavedGame } from "../game-agent-storage/game-agent-storage.service";
import { GameAgentAnalyzeService } from "../game-agent-analyze/game-agent-analyze.service";
import { ModelUnavailableError } from "../game-agent-analyze/game-agent-analyze.service";

const busy = new Set<string>();
const budget = Number(process.env.AGENT_BUDGET_USD || 1);
const RESERVATION = 0.015;
const ANALYZE_WINDOW_MS = 60000;
const MAX_ANALYZES_PER_WINDOW = 20;
const MIN_ANALYZE_GAP_MS = 1500;
const MAX_CALLS_PER_GAME = 80;
const lastRequests: number[] = [];
const SESSION_WINDOW_MS = 3600000;
export const MAX_SESSIONS_PER_WINDOW = 120;
const creations: number[] = [];

type AnalyzeTrigger = "automatic" | "manual" | "unspecified";
type AnalyzeCall = Awaited<ReturnType<GameAgentAnalyzeService["analyze"]>>;
type BoardRead = {
  revision: number;
  requestId: string;
  image: string;
  trigger: AnalyzeTrigger;
};

// Clears the analyze rate-limit counters.
export function resetAnalyzeGate() {
  lastRequests.length = 0;
  busy.clear();
}

// Clears the new-session rate-limit counters.
export function resetSessionCreations() {
  creations.length = 0;
}

@Injectable()
export class GameAgentService {
  // Stores the analyzer, board rules, and game storage.
  constructor(
    @Inject(GameAgentAnalyzeService)
    private readonly analyzer: GameAgentAnalyzeService,
    @Inject(GameAgentStorageService)
    private readonly storage: GameAgentStorageService,
    @Inject(GameAgentBoardService)
    private readonly board: GameAgentBoardService,
  ) {}

  // Reports whether a model key is configured.
  public status(): GameAgentStatusReply {
    return {
      configured: !!process.env.OPENROUTER_API_KEY,
      model: this.analyzer.model,
    };
  }

  // Opens a new game after the hourly cap check.
  public async createSession(input: CreateSessionRequest) {
    this.gateNewSession();
    const reply = this.createGame(input.profile ?? randomUUID());
    await this.storage.persist();
    return reply;
  }

  // Returns the current session reply.
  public sync(input: SessionRequest) {
    return this.sessionOf(input).reply;
  }

  // Reads a board snapshot for a session.
  public analyze(input: AnalyzeRequest) {
    const sessionId = this.sessionOf(input).reply.sessionId;
    return this.readBoard({
      id: sessionId,
      revision: input.revision,
      requestId: input.requestId,
      image: input.image,
      trigger: input.trigger ?? "unspecified",
    });
  }

  // Applies a user board correction.
  public feedback(input: FeedbackRequest) {
    const sessionId = this.sessionOf(input).reply.sessionId;
    return this.correctReading(sessionId, input.revision, input.board);
  }

  // Builds a fresh saved game and reply.
  private createGame(profile: string): GameAgentReply {
    const sessionId = randomUUID();
    const reader = this.reader();
    const key = this.board.captureKey(profile, reader.model, reader.promptVersion);
    const reply = this.emptyReply({ sessionId, profile, reader, key });
    this.storage.state.games[sessionId] = emptySavedGame(reply, profile, key);
    return reply;
  }

  // Builds the starting reply for a new game.
  private emptyReply(input: { sessionId: string; profile: string; reader: ReturnType<GameAgentService["reader"]>; key: string }): GameAgentReply {
    return {
      sessionId: input.sessionId,
      revision: 0,
      session: createSession(),
      analysis: null,
      status: "ready",
      message: "Hold the board still for a moment.",
      model: input.reader.model,
      decisionSource: "saved",
      latencyMs: 0,
      costUsd: 0,
      learnedExamples: this.storage.state.examples[input.profile]?.length ?? 0,
      feedback: this.board.createCaptureFeedback(this.storage.state.captureProfiles?.[input.key]),
    };
  }

  // Loads a saved game or rejects an expired session.
  private gameFor(id: string) {
    this.storage.pruneGames();
    const game = Object.hasOwn(this.storage.state.games, id) ? this.storage.state.games[id] : undefined;
    if (!game) throw new Error("This session has expired. Start a new game.");
    game.updatedAt = Date.now();
    return game;
  }

  // Runs a gated board read, or replays the last reply.
  private async readBoard(input: BoardRead & { id: string }): Promise<GameAgentReply> {
    const gated = this.gateAnalyze(input.id, input.revision, input.requestId);
    if (gated.replay) return gated.game.reply;
    return this.runAnalyze({
      game: gated.game,
      now: gated.now,
      revision: input.revision,
      requestId: input.requestId,
      image: input.image,
      trigger: input.trigger,
    });
  }

  // Saves a user-corrected board as the truth.
  private async correctReading(id: string, revision: number, board: Board): Promise<GameAgentReply> {
    const game = this.gameFor(id);
    assertCanCorrect({ game, id, revision, board });
    this.board.recordCaptureCorrection(game, this.captureProfiles(), this.reader());
    const session = this.correctedSession(game.reply.session, board);
    this.rememberExample(game, board);
    const reply = this.correctionReply(game, session, revision);
    this.board.completeCaptureFeedback(game, this.captureProfiles(), this.reader());
    await this.storage.persist();
    return reply;
  }

  // Calls the model and records spend for one read.
  private async runAnalyze(input: BoardRead & { game: SavedGame; now: number }) {
    busy.add(input.game.reply.sessionId);
    lastRequests.push(input.now);
    input.game.lastCallAt = input.now;
    input.game.calls++;
    this.storage.state.spent += RESERVATION;
    try {
      await this.storage.persist();
      const result = await this.callModel(input.game, input.image);
      const reply = this.applyModelResult({
        game: input.game,
        revision: input.revision,
        requestId: input.requestId,
        image: input.image,
        trigger: input.trigger,
        result,
      });
      await this.storage.persist();
      return reply;
    } finally {
      busy.delete(input.game.reply.sessionId);
    }
  }

  // Sends the snapshot to the analyzer and handles failures.
  private async callModel(game: SavedGame, image: string) {
    try {
      return await this.analyzer.analyze({
        image,
        board: game.reply.session.board,
        pendingMove: game.reply.session.pendingMove,
        examples: this.storage.state.examples[game.profile] ?? [],
      });
    } catch (error: unknown) {
      if (error instanceof ModelUnavailableError) this.storage.state.spent -= RESERVATION;
      this.board.feedbackFor(game).failedChecks++;
      await this.storage.persist();
      throw error;
    }
  }

  // Writes the model reading onto the saved game.
  private applyModelResult(input: BoardRead & { game: SavedGame; result: AnalyzeCall }): GameAgentReply {
    const previous = input.game.reply.session.board;
    this.storage.state.spent += input.result.costUsd - RESERVATION;
    input.game.lastImage = input.image;
    input.game.reply = withAnalysis({
      game: input.game,
      revision: input.revision,
      result: input.result,
      accepted: this.board.acceptAnalysis(input.game, input.result.analysis, this.reader()),
    });
    input.game.reply.session = addEvent(input.game.reply.session, {
      at: Date.now(),
      kind: "agent-request",
      message: requestEventMessage({
        result: input.result,
        trigger: input.trigger,
        image: input.image,
        status: input.game.reply.status,
      }),
    });
    input.game.lastRequestId = input.requestId;
    this.board.recordCaptureResult({
      game: input.game,
      previous,
      trigger: input.trigger,
      profiles: this.captureProfiles(),
      reader: this.reader(),
    });
    return input.game.reply;
  }

  // Blocks duplicate, busy, stale, rate-limited, or over-budget reads.
  private gateAnalyze(id: string, revision: number, requestId: string) {
    const game = this.gameFor(id);
    if (game.lastRequestId === requestId) return { game, replay: true as const };
    this.assertAnalyzeReady(id, revision, game);
    if (game.reply.session.phase === "finished") return { game, replay: true as const };
    const now = Date.now();
    this.assertAnalyzeBudget(game, now);
    return { game, replay: false as const, now };
  }

  // Throws when another check is running or the game moved on.
  private assertAnalyzeReady(id: string, revision: number, game: SavedGame) {
    if (busy.has(id)) throw new Error("A board check is already running.");
    if (revision !== game.reply.revision) throw new Error("The game changed. Check the board again.");
  }

  // Throws when the rate or spend cap would be exceeded.
  private assertAnalyzeBudget(game: SavedGame, now: number) {
    if (rateLimited(game, now)) throw new Error("Please wait a moment before checking again.");
    if (this.overBudget()) throw new Error("The configured analysis budget has been reached.");
  }

  // True when another model call would exceed the spend cap.
  private overBudget() {
    return !Number.isFinite(budget) || budget <= 0 || this.storage.state.spent + RESERVATION > budget;
  }

  // Keeps the last two corrected boards for this player.
  private rememberExample(game: SavedGame, board: Board) {
    const examples = this.storage.state.examples[game.profile] ?? [];
    this.storage.state.examples[game.profile] = [
      ...examples,
      {
        image: game.lastImage!,
        board: [...board],
        at: new Date().toISOString(),
      },
    ].slice(-2);
  }

  // Builds the reply after a user correction.
  private correctionReply(game: SavedGame, session: Session, revision: number): GameAgentReply {
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
      learnedExamples: this.storage.state.examples[game.profile].length,
      notice: null,
    };
    return game.reply;
  }

  // Rejects new games past the hourly session cap.
  private gateNewSession() {
    const now = Date.now();
    if (
      !withinWindow({
        stamps: creations,
        now,
        windowMs: SESSION_WINDOW_MS,
        max: MAX_SESSIONS_PER_WINDOW,
      })
    )
      throw new HttpException({ error: "Too many new games. Try later." }, 429);
    creations.push(now);
  }

  // Names the model and prompt used for this reader.
  private reader() {
    return {
      model: this.analyzer.model,
      promptVersion: this.analyzer.promptVersion,
    };
  }

  // Returns saved capture-timing profiles, creating the map if needed.
  private captureProfiles() {
    return (this.storage.state.captureProfiles ??= {});
  }

  // Rebuilds the session from an explicit user board.
  private correctedSession(previous: Session, board: Board): Session {
    let session = this.board.preservePendingMove(resumeBoard(board), previous);
    session = { ...session, pageMatchesBoard: true, events: previous.events };
    session = addEvent(session, {
      at: Date.now(),
      kind: "user-correction",
      board: [...board],
      message: "User explicitly corrected the photographed board. Example saved for this browser's future games.",
    });
    return { ...session, message: instruction(session) };
  }

  // Loads the game named in the request body.
  private sessionOf(input: SessionRequest) {
    return this.gameFor(input.sessionId);
  }
}

// Builds an empty saved game around a reply.
function emptySavedGame(reply: GameAgentReply, profile: string, key: string): SavedGame {
  return {
    reply,
    profile,
    captureKey: key,
    initialized: false,
    calls: 0,
    lastCallAt: 0,
    lastImage: null,
    lastRequestId: null,
    updatedAt: Date.now(),
  };
}

// Merges a model reading into the current reply.
function withAnalysis(input: { game: SavedGame; revision: number; result: AnalyzeCall; accepted: ReturnType<GameAgentBoardService["acceptAnalysis"]> }): GameAgentReply {
  return {
    ...input.game.reply,
    notice: null,
    ...input.accepted,
    analysis: input.result.analysis,
    revision: input.revision + 1,
    latencyMs: input.result.latencyMs,
    costUsd: input.game.reply.costUsd + input.result.costUsd,
  };
}

// Builds the agent-request event line.
function requestEventMessage(input: { result: AnalyzeCall; trigger: AnalyzeTrigger; image: string; status: GameAgentReply["status"] }): string {
  return `Request ${input.result.providerRequestId}; trigger: ${input.trigger}; snapshot ${createHash("sha256").update(input.image).digest("hex").slice(0, 16)}; ${input.result.latencyMs}ms; $${input.result.costUsd.toFixed(6)}; ${input.status}.`;
}

// Throws when a correction is busy, stale, missing, or illegal.
function assertCanCorrect(input: { game: SavedGame; id: string; revision: number; board: Board }) {
  if (busy.has(input.id) || input.game.reply.revision !== input.revision || !input.game.lastImage) throw new Error("Check the board first, then correct that reading.");
  const legal = checkLegality(input.board);
  if (!legal.valid) throw new Error(legal.reason);
}

// Drops old stamps and reports whether another call fits.
export function withinWindow(input: { stamps: number[]; now: number; windowMs: number; max: number }): boolean {
  while (input.stamps.length && input.stamps[0] < input.now - input.windowMs) input.stamps.shift();
  return input.stamps.length < input.max;
}

// True when this game or the global window is over the analyze cap.
function rateLimited(game: SavedGame, now: number): boolean {
  return (
    !withinWindow({
      stamps: lastRequests,
      now,
      windowMs: ANALYZE_WINDOW_MS,
      max: MAX_ANALYZES_PER_WINDOW,
    }) ||
    now - game.lastCallAt < MIN_ANALYZE_GAP_MS ||
    game.calls >= MAX_CALLS_PER_GAME
  );
}

// Turns the session board into high-confidence cells.
function boardCells(session: Session) {
  return session.board.map((mark) => ({
    mark: mark ?? "empty",
    confidence: 1,
  }));
}
