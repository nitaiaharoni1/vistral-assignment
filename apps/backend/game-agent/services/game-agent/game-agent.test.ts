import { beforeEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { analysis } from "../../../../../tests/helpers/boards.ts";
import { marks } from "../../../../../tests/helpers/boards.ts";
import type { Board } from "../../../../../shared/types";
import { GameAgentBoardService } from "../game-agent-board/game-agent-board.service";
import { GameAgentService } from "./game-agent.service";
import { resetAnalyzeGate } from "./game-agent.service";
import { resetSessionCreations } from "./game-agent.service";
import { withinWindow } from "./game-agent.service";
import { ModelUnavailableError } from "../game-agent-analyze/game-agent-analyze.service";
import type { GameAgentAnalyzeService } from "../game-agent-analyze/game-agent-analyze.service";
import { state } from "../game-agent-storage/game-agent-storage.service";
import type { GameAgentStorageService } from "../game-agent-storage/game-agent-storage.service";

const analyzeMock = vi.fn();
const persistMock = vi.fn().mockResolvedValue(undefined);
const pruneGamesMock = vi.fn();
const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const REQUEST_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REQUEST_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFILE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// Builds a GameAgentService with mocked analyzer and storage.
function makeAgent() {
  return new GameAgentService(
    {
      model: "test-model",
      promptVersion: "paper-board-v2",
      analyze: analyzeMock,
    } as unknown as GameAgentAnalyzeService,
    { state, persist: persistMock, pruneGames: pruneGamesMock } as unknown as GameAgentStorageService,
    new GameAgentBoardService(),
  );
}

// Builds a fake analyze result for tests.
function result(key = "....X....") {
  return {
    analysis: analysis(key),
    latencyMs: 15,
    costUsd: 0.01,
    providerRequestId: "or-test",
  };
}

function savedGame(sessionId: string) {
  const game = state.games[sessionId];
  if (!game) throw new Error("expected a saved game");
  return game;
}

function openSession() {
  return agent.createSession({ profile: PROFILE });
}

function readBoard({ sessionId, revision, requestId, trigger }: { sessionId: string; revision: number; requestId: string; trigger?: "automatic" | "manual" }) {
  return agent.analyze({
    sessionId,
    revision,
    requestId,
    image: JPEG,
    trigger,
  });
}

function correctReading(sessionId: string, revision: number, board: Board) {
  return agent.feedback({ sessionId, revision, board });
}

let agent: GameAgentService;

beforeEach(() => {
  resetAnalyzeGate();
  resetSessionCreations();
  state.spent = 0;
  state.games = {};
  state.examples = {};
  delete state.captureProfiles;
  analyzeMock.mockReset();
  persistMock.mockReset();
  persistMock.mockResolvedValue(undefined);
  pruneGamesMock.mockReset();
  agent = makeAgent();
});

describe("createSession and sync", () => {
  it("opens a new session for a profile", async () => {
    const reply = await openSession();
    expect(reply.revision).toBe(0);
    expect(reply.session.phase).toBe("human");
    expect(savedGame(reply.sessionId).profile).toBe(PROFILE);
  });

  it("counts examples already saved for the profile", async () => {
    state.examples[PROFILE] = [
      { image: JPEG, board: marks("....X...."), at: "a" },
      { image: JPEG, board: marks("X...O...."), at: "b" },
    ];
    expect((await openSession()).learnedExamples).toBe(2);
  });

  it("rejects an unknown session", () => {
    expect(() => agent.sync({ sessionId: REQUEST_A, revision: 0 })).toThrow(/expired/);
  });
});

describe("analyze", () => {
  beforeEach(() => {
    analyzeMock.mockResolvedValue(result());
  });

  it("accepts a first legal reading and remembers the request id", async () => {
    const created = await openSession();
    const reply = await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A, trigger: "automatic" });
    expect(reply.status).toBe("ready");
    expect(reply.revision).toBe(1);
    expect(reply.session.board[4]).toBe("X");
    expect(analyzeMock).toHaveBeenCalledOnce();
    const replay = await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    expect(replay.revision).toBe(1);
    expect(analyzeMock).toHaveBeenCalledOnce();
  });

  it("rejects a stale revision and a second in-flight check", async () => {
    const created = await openSession();
    await expect(readBoard({ sessionId: created.sessionId, revision: 3, requestId: REQUEST_A })).rejects.toThrow(/game changed/);
    let release!: (value: ReturnType<typeof result>) => void;
    analyzeMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    await expect(readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_B })).rejects.toThrow(/already running/);
    release(result());
    await pending;
  });

  it("replays the last reply after the game is finished", async () => {
    const created = await openSession();
    const game = savedGame(created.sessionId);
    game.reply.session = {
      ...game.reply.session,
      phase: "finished",
    };
    const reply = await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    expect(reply.session.phase).toBe("finished");
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("enforces the per-game gap, call cap, and budget", async () => {
    const created = await openSession();
    await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    await expect(readBoard({ sessionId: created.sessionId, revision: 1, requestId: REQUEST_B })).rejects.toThrow(/wait a moment/);
    resetAnalyzeGate();
    const game = savedGame(created.sessionId);
    game.lastCallAt = 0;
    game.calls = 80;
    await expect(readBoard({ sessionId: created.sessionId, revision: 1, requestId: REQUEST_B })).rejects.toThrow(/wait a moment/);
    game.calls = 0;
    state.spent = 99.99;
    await expect(readBoard({ sessionId: created.sessionId, revision: 1, requestId: REQUEST_B })).rejects.toThrow(/budget/);
  });

  it("records a failed model call on the capture feedback", async () => {
    analyzeMock.mockRejectedValue(new Error("The model credit limit was reached."));
    const created = await openSession();
    await expect(readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A })).rejects.toThrow(/credit limit/);
    expect(savedGame(created.sessionId).reply.feedback?.failedChecks).toBe(1);
    expect(state.spent).toBeCloseTo(0.015);
  });

  it("returns the reservation when the provider refused the call", async () => {
    analyzeMock.mockRejectedValue(new ModelUnavailableError("The model key was not accepted."));
    const created = await openSession();
    await expect(readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A })).rejects.toThrow(/not accepted/);
    expect(state.spent).toBeCloseTo(0);
    expect(savedGame(created.sessionId).reply.feedback?.failedChecks).toBe(1);
  });

  it("charges the real cost after the reservation and logs the trigger", async () => {
    const created = await openSession();
    const reply = await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A, trigger: "automatic" });
    expect(state.spent).toBeCloseTo(0.01);
    expect(reply.costUsd).toBeCloseTo(0.01);
    expect(reply.session.events.at(-1)?.message).toMatch(/trigger: automatic/);
  });

  it("caps analyze calls across games in the same minute", async () => {
    await Array.from({ length: 20 }, (_, index) => index).reduce(async (done, index) => {
      await done;
      const created = await openSession();
      const requestId = `aaaaaaaa-aaaa-aaaa-aaaa-${String(index).padStart(12, "0")}`;
      await readBoard({ sessionId: created.sessionId, revision: 0, requestId });
    }, Promise.resolve());
    const extra = await openSession();
    await expect(readBoard({ sessionId: extra.sessionId, revision: 0, requestId: REQUEST_B })).rejects.toThrow(/wait a moment/);
  });
});

describe("feedback", () => {
  it("requires a prior snapshot, then saves the last two examples", async () => {
    const created = await openSession();
    await expect(correctReading(created.sessionId, 0, marks("....X...."))).rejects.toThrow(/Check the board first/);
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    const first = await correctReading(created.sessionId, 1, marks("....X...."));
    expect(first.decisionSource).toBe("rules");
    expect(first.learnedExamples).toBe(1);
    expect(first.session.events.some((event) => event.kind === "user-correction")).toBe(true);
    const second = await correctReading(created.sessionId, 2, marks("X...O...."));
    const third = await correctReading(created.sessionId, 3, marks("XO..X...."));
    expect(third.learnedExamples).toBe(2);
    expect(state.examples[PROFILE]?.map((example) => example.board[0])).toEqual(["X", "X"]);
    expect(second.revision).toBe(3);
  });

  it("rejects an illegal correction", async () => {
    const created = await openSession();
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    await expect(correctReading(created.sessionId, 1, marks("XX......."))).rejects.toThrow(/X starts/);
  });

  it("rejects a stale correction revision", async () => {
    const created = await openSession();
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard({ sessionId: created.sessionId, revision: 0, requestId: REQUEST_A });
    await expect(correctReading(created.sessionId, 0, marks("....X...."))).rejects.toThrow(/Check the board first/);
  });
});

describe("withinWindow", () => {
  it("drops stamps that have left the window and then allows a new one", () => {
    const stamps = [100, 200, 300];
    expect(withinWindow({ stamps, now: 1000, windowMs: 500, max: 3 })).toBe(true);
    expect(stamps).toEqual([]);
  });

  it("refuses a stamp once the window is full", () => {
    const stamps = [900, 950, 980];
    expect(withinWindow({ stamps, now: 1000, windowMs: 500, max: 3 })).toBe(false);
    expect(stamps).toEqual([900, 950, 980]);
  });

  it("keeps recent stamps and removes only the old ones", () => {
    const stamps = [100, 800, 900];
    expect(withinWindow({ stamps, now: 1000, windowMs: 500, max: 3 })).toBe(true);
    expect(stamps).toEqual([800, 900]);
  });
});
