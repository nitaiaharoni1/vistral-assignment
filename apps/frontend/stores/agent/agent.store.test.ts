import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@shared/session.helpers";
import { marks, observation } from "../../../../tests/helpers/boards.ts";
import { agentReply } from "../../../../tests/helpers/agent-fixtures.ts";
import { GameStore } from "../game/game.store";
import { AgentStore } from "./agent.store";
import { inkChanged } from "./board-snapshot";

vi.mock("./board-snapshot.ts", () => ({
  captureBoard: vi.fn(() => ({
    image: "data:image/jpeg;base64,/9j/SNAP",
    ink: [0.1, 0, 0, 0, 0, 0, 0, 0, 0],
  })),
  inkChanged: vi.fn(() => true),
}));

const SESSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function reply(overrides = {}) {
  return agentReply({
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

describe("AgentStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is enabled only for the camera and can check a live board", () => {
    const game = cameraGame();
    const agent = game.agent;
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
    await game.agent.connect();
    expect(game.agent.reply?.sessionId).toBe(SESSION_ID);
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
    await game.agent.connect();
    expect(game.agent.message).toMatch(/not configured/);
    expect(game.agent.reply).toBeNull();
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
    const agent = new AgentStore(game);
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
    const agent = game.agent;
    agent.reply = reply({ revision: 1 });
    await agent.checkNow();
    expect(agent.reply?.revision).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens a correction only when a reading exists", () => {
    const game = cameraGame();
    game.agent.openCorrection();
    expect(game.agent.correctionOpen).toBe(false);
    game.agent.reply = reply();
    game.agent.openCorrection();
    expect(game.agent.correctionOpen).toBe(true);
    game.agent.closeCorrection();
    expect(game.agent.correctionOpen).toBe(false);
  });

  it("does not sample while the tab is hidden or the game is finished", () => {
    const game = cameraGame();
    game.agent.reply = reply();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    game.agent.observe(observation(".........", 20, [], { quality: "good" }));
    expect(game.agent.busy).toBe(false);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    game.play.session.phase = "finished";
    game.agent.observe(observation(".........", 40));
    expect(game.agent.busy).toBe(false);
  });

  it("cannot check a finished, blocked, or unframed board", () => {
    const game = cameraGame();
    expect(game.agent.canCheck).toBe(true);
    game.cameraFeed.corners = [];
    expect(game.agent.canCheck).toBe(false);
    game.cameraFeed.corners = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    game.play.session.paused = true;
    expect(game.agent.canCheck).toBe(false);
    game.play.session.paused = false;
    game.source = "sample";
    expect(game.agent.canCheck).toBe(false);
  });

  it("asks to hold still when the current frame is not ready", async () => {
    const game = cameraGame();
    game.agent.reply = reply();
    game.cameraFeed.observation = observation(".........", 10, [], {
      quality: "dark",
    });
    await game.agent.checkNow();
    expect(game.agent.message).toMatch(/Hold the whole board still/);
  });

  it("does nothing when a check is not allowed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.stage = "detecting";
    await game.agent.checkNow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a previous reply on reset", () => {
    const game = cameraGame();
    game.agent.reply = reply();
    game.agent.message = "old";
    game.agent.correctionOpen = true;
    game.agent.reset();
    expect(game.agent.reply).toBeNull();
    expect(game.agent.message).toBe("");
    expect(game.agent.correctionOpen).toBe(false);
  });

  it("skips a second connect once a session exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const game = cameraGame();
    game.agent.reply = reply();
    await game.agent.connect();
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
    game.agent.reply = reply();
    const frame = observation(".........", 20, [], { quality: "good" });
    vi.advanceTimersByTime(120);
    game.agent.observe(frame);
    game.agent.observe(frame);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    game.agent.observe(frame);
    vi.advanceTimersByTime(150);
    game.agent.observe(frame);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
    vi.mocked(inkChanged).mockReturnValue(true);
  });
});
