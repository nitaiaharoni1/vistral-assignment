import { describe, expect, it } from "vitest";
import {
  captureKey,
  completeCaptureFeedback,
  createCaptureFeedback,
  feedbackFor,
  recordCaptureResult,
} from "./capture-feedback";
import { DEFAULT_CAPTURE_STABLE_MS } from "../../../../shared/agent-protocol";
import { marks, session } from "../../../../tests/helpers/boards.ts";
import {
  gameWithSession,
  savedGame,
} from "../../../../tests/helpers/agent-fixtures.ts";
import { state } from "../../storage/storage";
import { model, PROMPT_VERSION } from "../analyze";

describe("captureKey and createCaptureFeedback", () => {
  it("keys memory by profile, model, and prompt", () => {
    expect(captureKey("p1")).toBe(
      JSON.stringify(["p1", model, PROMPT_VERSION, "capture-timing-v1"]),
    );
  });

  it("starts from the default wait, or from saved memory", () => {
    expect(createCaptureFeedback().stableMs).toBe(DEFAULT_CAPTURE_STABLE_MS);
    const key = captureKey("p1");
    state.captureProfiles = {
      [key]: {
        version: 3,
        stableMs: 500,
        completedGames: 2,
        lastSessionId: "s",
        lastResult: createCaptureFeedback(),
      },
    };
    expect(createCaptureFeedback(key)).toMatchObject({
      memoryVersion: 3,
      stableMs: 500,
    });
  });
});

describe("recordCaptureResult", () => {
  it("counts automatic unclear and rejected checks", () => {
    const game = savedGame();
    game.reply.status = "uncertain";
    game.reply.latencyMs = 12;
    recordCaptureResult(game, marks("........."), "automatic");
    expect(feedbackFor(game)).toMatchObject({
      automaticChecks: 1,
      unclearChecks: 1,
      confirmedMoves: 0,
      totalLatencyMs: 12,
    });
    game.reply.status = "rejected";
    recordCaptureResult(game, marks("........."), "automatic");
    expect(feedbackFor(game).rejectedChecks).toBe(1);
  });

  it("counts a confirmed automatic move and ignores later completed games", () => {
    const game = gameWithSession(session({ board: marks("....X....") }));
    game.reply.status = "ready";
    recordCaptureResult(game, marks("........."), "automatic");
    expect(feedbackFor(game).confirmedMoves).toBe(1);
    game.reply.feedback!.completedAt = "already";
    recordCaptureResult(game, marks("........."), "manual");
    expect(feedbackFor(game).manualChecks).toBe(0);
  });

  it("counts a manual check without treating it as automatic", () => {
    const game = savedGame();
    recordCaptureResult(game, marks("........."), "manual");
    expect(feedbackFor(game)).toMatchObject({
      manualChecks: 1,
      automaticChecks: 0,
    });
  });
});

function finish(overrides: {
  automaticChecks?: number;
  unclearChecks?: number;
  rejectedChecks?: number;
  failedChecks?: number;
  corrections?: number;
  confirmedMoves?: number;
  stableMs?: number;
  memoryVersion?: number;
}) {
  const game = gameWithSession(
    session({ phase: "finished", board: marks("XXXOO....") }),
  );
  game.reply.feedback = {
    ...createCaptureFeedback(),
    automaticChecks: 6,
    confirmedMoves: 3,
    ...overrides,
  };
  completeCaptureFeedback(game);
  return game;
}

describe("completeCaptureFeedback", () => {
  it("does nothing until the game is finished", () => {
    const game = savedGame();
    completeCaptureFeedback(game);
    expect(feedbackFor(game).completedAt).toBeNull();
  });

  it("keeps timing when the person corrected the board", () => {
    const game = finish({ corrections: 1, stableMs: 400 });
    expect(game.reply.feedback?.updateReason).toMatch(/manual corrections/);
    expect(game.reply.feedback?.nextStableMs).toBe(400);
  });

  it("keeps timing without enough automatic evidence", () => {
    const game = finish({ automaticChecks: 5, confirmedMoves: 3 });
    expect(game.reply.feedback?.updateReason).toMatch(/insufficient/);
  });

  it("keeps timing after a rejected reading", () => {
    expect(finish({ rejectedChecks: 1 }).reply.feedback?.updateReason).toMatch(
      /rejected readings/,
    );
  });

  it("keeps timing after a failed request", () => {
    expect(finish({ failedChecks: 1 }).reply.feedback?.updateReason).toMatch(
      /request failures/,
    );
  });

  it("waits longer when many automatic readings were unclear", () => {
    const game = finish({
      automaticChecks: 8,
      unclearChecks: 2,
      stableMs: 300,
    });
    expect(game.reply.feedback?.nextStableMs).toBe(400);
    expect(game.reply.feedback?.updateReason).toMatch(/100 ms longer/);
  });

  it("shortens the wait when every automatic reading was clear", () => {
    const game = finish({ stableMs: 500, unclearChecks: 0 });
    expect(game.reply.feedback?.nextStableMs).toBe(400);
    expect(game.reply.feedback?.updateReason).toMatch(/Reduce extra waiting/);
  });

  it("keeps mixed evidence as-is", () => {
    const game = finish({
      automaticChecks: 8,
      unclearChecks: 1,
      stableMs: 400,
    });
    expect(game.reply.feedback?.updateReason).toMatch(/mixed evidence/);
    expect(game.reply.feedback?.nextStableMs).toBe(400);
  });

  it("does not overwrite a newer profile version", () => {
    const key = captureKey("22222222-2222-2222-2222-222222222222");
    state.captureProfiles = {
      [key]: {
        version: 2,
        stableMs: 700,
        completedGames: 1,
        lastSessionId: "other",
        lastResult: createCaptureFeedback(),
      },
    };
    const game = finish({ memoryVersion: 1, unclearChecks: 0, stableMs: 500 });
    expect(game.reply.feedback?.nextStableMs).toBe(700);
    expect(game.reply.feedback?.updateReason).toMatch(/newer timing/);
  });
});
