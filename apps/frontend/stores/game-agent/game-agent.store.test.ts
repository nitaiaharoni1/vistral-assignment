import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { createSession } from "@shared/session-helpers/session.helpers";
import { marks } from "../../../../tests/helpers/boards.ts";
import { observation } from "../../../../tests/helpers/boards.ts";
import { gameAgentReply } from "../../../../tests/helpers/game-agent-fixtures.ts";
import { GameStore } from "../game/game.store";
import { GameAgentStore } from "./game-agent.store";
import { inkChanged } from "./board-snapshot";

vi.mock("./board-snapshot.ts", () => ({
  captureBoard: vi.fn(() => ({
    image: "data:image/jpeg;base64,/9j/SNAP",
    ink: [0.1, 0, 0, 0, 0, 0, 0, 0, 0],
  })),
  inkChanged: vi.fn(() => true),
}));

const SESSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

// Builds a test agent reply.
function reply(overrides = {}) {
  return gameAgentReply({
    sessionId: SESSION_ID,
    session: createSession(),
    analysis: {
      cells: Array.from({ length: 9 }, () => ({
        mark: "empty" as const,
        confidence: 1,
      })),
      clear: true,
      reason: "ok",
    },
    ...overrides,
  });
}

// Builds a camera game ready for agent checks.
function cameraGame() {
  const game = new GameStore();
  game.source = "camera";
  game.stage = "playing";
  game.cameraFeed.corners = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  game.cameraFeed.canvas = document.createElement("canvas");
  game.cameraFeed.observation = observation(".........", 10);
  return game;
}

describe("GameAgentStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is enabled only for the camera and can check a live board", () => {
    const game = cameraGame();
    const agent = game.gameAgent;
    expect(agent.enabled).toBe(true);
    expect(agent.canCheck).toBe(true);
    game.play.session.phase = "finished";
    expect(agent.canCheck).toBe(false);
  });

  it("connects and applies the first reply", async () => {
    const created = reply();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => created,
      }),
    );
    const game = cameraGame();
    await game.gameAgent.connect();
    expect(game.gameAgent.reply?.sessionId).toBe(SESSION_ID);
    expect(game.preparingBoard).toBe(false);
  });

  it("keeps a connection error on the store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "The board reader is not configured yet.",
        }),
      }),
    );
    const game = cameraGame();
    await game.gameAgent.connect();
    expect(game.gameAgent.message).toMatch(/not configured/);
    expect(game.gameAgent.reply).toBeNull();
  });

  it("sends a correction and closes the dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => reply({ revision: 2 }),
      }),
    );
    const game = cameraGame();
    const agent = new GameAgentStore(game);
    agent.reply = reply({ revision: 1 });
    agent.correctionOpen = true;
    await agent.correct(marks("....X...."));
    expect(agent.reply?.revision).toBe(2);
    expect(agent.correctionOpen).toBe(false);
  });

  it("syncs a newer revision after a failed analyze", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reply({ revision: 4 }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    const agent = game.gameAgent;
    agent.reply = reply({ revision: 1 });
    await agent.checkNow();
    expect(agent.reply?.revision).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens a correction only when a reading exists", () => {
    const game = cameraGame();
    game.gameAgent.openCorrection();
    expect(game.gameAgent.correctionOpen).toBe(false);
    game.gameAgent.reply = reply();
    game.gameAgent.openCorrection();
    expect(game.gameAgent.correctionOpen).toBe(true);
    game.gameAgent.closeCorrection();
    expect(game.gameAgent.correctionOpen).toBe(false);
  });

  it("does not sample while the tab is hidden or the game is finished", () => {
    const game = cameraGame();
    game.gameAgent.reply = reply();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    game.gameAgent.observe(observation(".........", 20, { quality: "good" }));
    expect(game.gameAgent.busy).toBe(false);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    game.play.session.phase = "finished";
    game.gameAgent.observe(observation(".........", 40));
    expect(game.gameAgent.busy).toBe(false);
  });

  it("cannot check a finished, blocked, or unframed board", () => {
    const game = cameraGame();
    expect(game.gameAgent.canCheck).toBe(true);
    game.cameraFeed.corners = [];
    expect(game.gameAgent.canCheck).toBe(false);
    game.cameraFeed.corners = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    game.play.session.paused = true;
    expect(game.gameAgent.canCheck).toBe(false);
    game.play.session.paused = false;
    game.source = "sample";
    expect(game.gameAgent.canCheck).toBe(false);
  });

  it("asks to hold still when the current frame is not ready", async () => {
    const game = cameraGame();
    game.gameAgent.reply = reply();
    game.cameraFeed.observation = observation(".........", 10, {
      quality: "dark",
    });
    await game.gameAgent.checkNow();
    expect(game.gameAgent.message).toMatch(/Hold the whole board still/);
  });

  it("does nothing when a check is not allowed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.stage = "detecting";
    await game.gameAgent.checkNow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a previous reply on reset", () => {
    const game = cameraGame();
    game.gameAgent.reply = reply();
    game.gameAgent.message = "old";
    game.gameAgent.correctionOpen = true;
    game.gameAgent.reset();
    expect(game.gameAgent.reply).toBeNull();
    expect(game.gameAgent.message).toBe("");
    expect(game.gameAgent.correctionOpen).toBe(false);
  });

  it("skips a second connect once a session exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.gameAgent.reply = reply();
    await game.gameAgent.connect();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throttles automatic samples and then checks a stable board", async () => {
    vi.useFakeTimers();
    vi.mocked(inkChanged).mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => reply({ revision: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.gameAgent.reply = reply();
    const frame = observation(".........", 20, { quality: "good" });
    vi.advanceTimersByTime(120);
    game.gameAgent.observe(frame);
    game.gameAgent.observe(frame);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    game.gameAgent.observe(frame);
    vi.advanceTimersByTime(150);
    game.gameAgent.observe(frame);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
    vi.mocked(inkChanged).mockReturnValue(true);
  });

  it("retries the same view after a failed check once the backoff passes", async () => {
    vi.useFakeTimers();
    vi.mocked(inkChanged).mockReturnValue(false);
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.gameAgent.reply = reply();
    const frame = observation(".........", 20, { quality: "good" });
    // Holds the same frame still long enough to trigger a check.
    const holdStill = () => {
      for (let sample = 0; sample < 3; sample++) {
        vi.advanceTimersByTime(150);
        game.gameAgent.observe(frame);
      }
    };
    holdStill();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(game.gameAgent.message).toBe("network");
    holdStill();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    holdStill();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
    vi.mocked(inkChanged).mockReturnValue(true);
  });
});
