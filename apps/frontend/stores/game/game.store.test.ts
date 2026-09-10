import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { marks } from "../../../../tests/helpers/boards.ts";
import { observation } from "../../../../tests/helpers/boards.ts";
import { gameAgentReply } from "../../../../tests/helpers/game-agent-fixtures.ts";
import { GameStore } from "./game.store";

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
});

describe("GameStore", () => {
  it("starts idle and exposes stage flags", () => {
    const game = new GameStore();
    expect(game.welcome).toBe(true);
    expect(game.settingUp).toBe(false);
    expect(game.inGame).toBe(false);
    expect(game.canLoadVideo).toBe(true);
    expect(game.usesRemoteAgent).toBe(false);
  });

  it("maps camera analysis cells onto the displayed observation", () => {
    const game = new GameStore();
    game.source = "camera";
    game.cameraFeed.observation = observation(".........", 10);
    game.gameAgent.reply = {
      sessionId: "s",
      revision: 1,
      session: game.session,
      analysis: {
        cells: [
          { mark: "X", confidence: 0.9 },
          { mark: "empty", confidence: 1 },
          { mark: "unknown", confidence: 0.2 },
          ...Array.from({ length: 6 }, () => ({
            mark: "empty" as const,
            confidence: 1,
          })),
        ],
        clear: true,
        reason: "ok",
      },
      status: "ready",
      message: "",
      model: "test",
      decisionSource: "rules",
      latencyMs: 1,
      costUsd: 0,
      learnedExamples: 0,
    };
    expect(game.observation?.cells[0]).toMatchObject({
      mark: "X",
      readable: true,
    });
    expect(game.observation?.cells[1]).toMatchObject({ mark: null });
    expect(game.observation?.cells[2]).toMatchObject({
      mark: "?",
      readable: false,
    });
  });

  it("imports a local board when the camera agent is off", () => {
    const game = new GameStore();
    game.source = "sample";
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    const started = game.onBoardDetected(marks("....X...."));
    expect(started).toBe(true);
    expect(game.stage).toBe("playing");
    expect(game.session.board[4]).toBe("X");
  });

  it("rejects an illegal imported board", () => {
    const game = new GameStore();
    game.source = "sample";
    expect(game.onBoardDetected(marks("XX......."))).toBe(false);
    expect(game.stage).toBe("corners");
    expect(game.error).toMatch(/X starts/);
  });

  it("pauses and flags a restart when a video ends early", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.onObservation(observation(".........", 10), true);
    expect(game.needsRestart).toBe(true);
    expect(game.session.paused).toBe(true);
    expect(game.error).toMatch(/video ended/);
  });

  it("handles camera mute, unmute, and feed failure", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.onCameraAvailability("muted");
    expect(game.session.paused).toBe(true);
    expect(game.error).toMatch(/stopped sending frames/);
    game.onCameraAvailability("unmuted");
    expect(game.error).toMatch(/Press Resume/);
    game.onFeedFailure("Reader died.");
    expect(game.needsRestart).toBe(true);
    expect(game.blocked).toBe(true);
  });

  it("resets back to the welcome screen", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.source = "sample";
    game.error = "x";
    game.reset();
    expect(game.stage).toBe("idle");
    expect(game.source).toBe("none");
    expect(game.error).toBe("");
  });

  it("does not pause when a finished video ends", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.play.session.phase = "finished";
    game.onVideoEnded(false);
    expect(game.needsRestart).toBe(false);
    expect(game.error).toBe("");
  });

  it("reports an unsaved camera game once a mark is recognized", () => {
    const game = new GameStore();
    game.source = "camera";
    expect(game.hasUnsavedGame).toBe(false);
    game.play.session.recognizedBoard = marks("X........");
    expect(game.hasUnsavedGame).toBe(true);
  });

  it("ignores pause unless a live game can be paused", () => {
    const game = new GameStore();
    game.togglePause();
    expect(game.session.paused).toBe(false);
  });

  it("pauses and resumes a live game once the reader is ready", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.cameraFeed.readerReady = true;
    game.togglePause();
    expect(game.session.paused).toBe(true);
    game.togglePause();
    expect(game.session.paused).toBe(false);
  });

  it("blocks resume when the video has already ended", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.source = "video";
    game.cameraFeed.readerReady = true;
    game.cameraFeed.video = { ended: true } as HTMLVideoElement;
    game.togglePause();
    expect(game.error).toMatch(/video has ended/);
    expect(game.session.paused).toBe(false);
  });

  it("exposes resume, video, and detect-again flags", () => {
    const game = new GameStore();
    expect(game.showVideo).toBe(false);
    expect(game.canResume).toBe(false);
    expect(game.canDetectAgain).toBe(false);
    game.source = "camera";
    game.stage = "playing";
    game.sourceReady = true;
    game.cameraFeed.readerReady = true;
    expect(game.showVideo).toBe(true);
    expect(game.canResume).toBe(true);
    expect(game.canDetectAgain).toBe(true);
  });

  it("starts detecting when the camera source is ready", () => {
    const game = new GameStore();
    game.onSourceStarted(true);
    expect(game.sourceReady).toBe(true);
    expect(game.stage).toBe("detecting");
  });

  it("looks again once the reader is ready", () => {
    const game = new GameStore();
    game.source = "camera";
    game.stage = "corners";
    game.error = "old";
    game.detectAgain();
    expect(game.stage).toBe("corners");
    game.cameraFeed.readerReady = true;
    game.detectAgain();
    expect(game.stage).toBe("detecting");
    expect(game.error).toBe("");
    game.source = "sample";
    game.detectAgain();
    expect(game.stage).toBe("calibrating");
  });

  it("restarts a camera game that still has a live stream", () => {
    const game = new GameStore();
    game.source = "camera";
    game.stage = "playing";
    game.preparingBoard = false;
    game.cameraFeed.stream = {} as MediaStream;
    game.cameraFeed.readerReady = true;
    game.play.session.board = marks("X........");
    game.restartGame();
    expect(game.preparingBoard).toBe(true);
    expect(game.session.board.every((cell) => cell === null)).toBe(true);
    expect(game.stage).toBe("detecting");
  });

  it("opens a remote session when the camera finds a board", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => gameAgentReply(),
      }),
    );
    const game = new GameStore();
    game.source = "camera";
    const started = game.onBoardDetected(marks("........."));
    expect(started).toBe(true);
    expect(game.stage).toBe("playing");
    expect(game.usesRemoteAgent).toBe(true);
    await vi.waitFor(() => expect(game.gameAgent.reply).not.toBeNull());
    expect(game.preparingBoard).toBe(false);
  });

  it("pauses a newly detected board when the tab is hidden", () => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    const game = new GameStore();
    game.source = "sample";
    game.onBoardDetected(marks("........."));
    expect(game.session.paused).toBe(true);
  });

  it("blanks the displayed cells until the camera agent answers", () => {
    const game = new GameStore();
    game.source = "camera";
    game.cameraFeed.observation = observation("....X....", 10);
    expect(game.observation?.cells.every((cell) => cell.mark === null)).toBe(true);
    expect(game.observation?.cells.every((cell) => !cell.readable)).toBe(true);
  });

  it("keeps a pending ended video from forcing a restart", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.onVideoEnded(true);
    expect(game.needsRestart).toBe(false);
    expect(game.session.paused).toBe(false);
    expect(game.error).toMatch(/video ended/);
    game.onVideoEnded(false);
    expect(game.needsRestart).toBe(true);
    expect(game.session.paused).toBe(true);
  });

  it("returns to idle when the camera fails during startup", () => {
    const game = new GameStore();
    game.stage = "starting";
    game.onFeedFailure("No camera.", true);
    expect(game.stage).toBe("idle");
    expect(game.needsRestart).toBe(false);
    expect(game.error).toBe("No camera.");
  });

  it("records board-not-found, feed, and interrupt notices", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.sourceReady = true;
    game.onBoardNotFound();
    expect(game.detectionHint).toMatch(/four grid lines/);
    game.onFeedNotice("Hold still.");
    expect(game.error).toBe("Hold still.");
    game.onPlaybackInterrupted("Stopped.", true);
    expect(game.session.paused).toBe(true);
    expect(game.sourceReady).toBe(false);
    expect(game.error).toBe("Stopped.");
  });
});
