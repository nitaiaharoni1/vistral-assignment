import { beforeEach, describe, expect, it, vi } from "vitest";
import { analysis, marks } from "../../../tests/helpers/boards.ts";
import type * as AnalyzeModule from "./analyze.ts";
import type * as StorageModule from "../storage/storage.ts";

vi.mock("./analyze.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AnalyzeModule;
  return { ...actual, analyze: vi.fn() };
});

vi.mock("../storage/storage.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof StorageModule;
  return { ...actual, persist: vi.fn().mockResolvedValue(undefined) };
});

import { analyze } from "./analyze";
import {
  correctReading,
  createGame,
  gameFor,
  readBoard,
  resetAnalyzeGate,
} from "./agent";
import { state } from "../storage/storage";

const analyzeMock = vi.mocked(analyze);
const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const REQUEST_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REQUEST_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFILE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function result(key = "....X....") {
  return {
    analysis: analysis(key),
    latencyMs: 15,
    costUsd: 0.01,
    providerRequestId: "or-test",
  };
}

beforeEach(() => {
  resetAnalyzeGate();
});

describe("createGame and gameFor", () => {
  it("opens a new session for a profile", () => {
    const reply = createGame(PROFILE);
    expect(reply.revision).toBe(0);
    expect(reply.session.phase).toBe("human");
    expect(gameFor(reply.sessionId).profile).toBe(PROFILE);
  });

  it("counts examples already saved for the profile", () => {
    state.examples[PROFILE] = [
      { image: JPEG, board: marks("....X...."), at: "a" },
      { image: JPEG, board: marks("X...O...."), at: "b" },
    ];
    expect(createGame(PROFILE).learnedExamples).toBe(2);
  });

  it("rejects an unknown session", () => {
    expect(() => gameFor(REQUEST_A)).toThrow(/expired/);
  });
});

describe("readBoard", () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    analyzeMock.mockResolvedValue(result());
  });

  it("accepts a first legal reading and remembers the request id", async () => {
    const created = createGame(PROFILE);
    const reply = await readBoard(
      created.sessionId,
      0,
      REQUEST_A,
      JPEG,
      "automatic",
    );
    expect(reply.status).toBe("ready");
    expect(reply.revision).toBe(1);
    expect(reply.session.board[4]).toBe("X");
    expect(analyzeMock).toHaveBeenCalledOnce();
    const replay = await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    expect(replay.revision).toBe(1);
    expect(analyzeMock).toHaveBeenCalledOnce();
  });

  it("rejects a stale revision and a second in-flight check", async () => {
    const created = createGame(PROFILE);
    await expect(
      readBoard(created.sessionId, 3, REQUEST_A, JPEG),
    ).rejects.toThrow(/game changed/);
    let release!: (value: ReturnType<typeof result>) => void;
    analyzeMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    await expect(
      readBoard(created.sessionId, 0, REQUEST_B, JPEG),
    ).rejects.toThrow(/already running/);
    release(result());
    await pending;
  });

  it("replays the last reply after the game is finished", async () => {
    const created = createGame(PROFILE);
    const game = gameFor(created.sessionId);
    game.reply.session = {
      ...game.reply.session,
      phase: "finished",
    };
    const reply = await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    expect(reply.session.phase).toBe("finished");
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("enforces the per-game gap, call cap, and budget", async () => {
    const created = createGame(PROFILE);
    await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    await expect(
      readBoard(created.sessionId, 1, REQUEST_B, JPEG),
    ).rejects.toThrow(/wait a moment/);
    resetAnalyzeGate();
    const game = gameFor(created.sessionId);
    game.lastCallAt = 0;
    game.calls = 80;
    await expect(
      readBoard(created.sessionId, 1, REQUEST_B, JPEG),
    ).rejects.toThrow(/wait a moment/);
    game.calls = 0;
    state.spent = 99.99;
    await expect(
      readBoard(created.sessionId, 1, REQUEST_B, JPEG),
    ).rejects.toThrow(/budget/);
  });

  it("records a failed model call on the capture feedback", async () => {
    analyzeMock.mockRejectedValue(
      new Error("The model credit limit was reached."),
    );
    const created = createGame(PROFILE);
    await expect(
      readBoard(created.sessionId, 0, REQUEST_A, JPEG),
    ).rejects.toThrow(/credit limit/);
    expect(gameFor(created.sessionId).reply.feedback?.failedChecks).toBe(1);
  });

  it("charges the real cost after the reservation and logs the trigger", async () => {
    const created = createGame(PROFILE);
    const reply = await readBoard(
      created.sessionId,
      0,
      REQUEST_A,
      JPEG,
      "automatic",
    );
    expect(state.spent).toBeCloseTo(0.01);
    expect(reply.costUsd).toBeCloseTo(0.01);
    expect(reply.session.events.at(-1)?.message).toMatch(/trigger: automatic/);
  });

  it("caps analyze calls across games in the same minute", async () => {
    await Array.from({ length: 20 }, (_, index) => index).reduce(
      async (done, index) => {
        await done;
        const created = createGame(PROFILE);
        const requestId = `aaaaaaaa-aaaa-aaaa-aaaa-${String(index).padStart(12, "0")}`;
        await readBoard(created.sessionId, 0, requestId, JPEG);
      },
      Promise.resolve(),
    );
    const extra = createGame(PROFILE);
    await expect(
      readBoard(extra.sessionId, 0, REQUEST_B, JPEG),
    ).rejects.toThrow(/wait a moment/);
  });
});

describe("correctReading", () => {
  it("requires a prior snapshot, then saves the last two examples", async () => {
    const created = createGame(PROFILE);
    await expect(
      correctReading(created.sessionId, 0, marks("....X....")),
    ).rejects.toThrow(/Check the board first/);
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    const first = await correctReading(
      created.sessionId,
      1,
      marks("....X...."),
    );
    expect(first.decisionSource).toBe("rules");
    expect(first.learnedExamples).toBe(1);
    expect(
      first.session.events.some((event) => event.kind === "user-correction"),
    ).toBe(true);
    const second = await correctReading(
      created.sessionId,
      2,
      marks("X...O...."),
    );
    const third = await correctReading(
      created.sessionId,
      3,
      marks("XO..X...."),
    );
    expect(third.learnedExamples).toBe(2);
    expect(state.examples[PROFILE]?.map((example) => example.board[0])).toEqual(
      ["X", "X"],
    );
    expect(second.revision).toBe(3);
  });

  it("rejects an illegal correction", async () => {
    const created = createGame(PROFILE);
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    await expect(
      correctReading(created.sessionId, 1, marks("XX.......")),
    ).rejects.toThrow(/X starts/);
  });

  it("rejects a stale correction revision", async () => {
    const created = createGame(PROFILE);
    analyzeMock.mockResolvedValue(result("........."));
    await readBoard(created.sessionId, 0, REQUEST_A, JPEG);
    await expect(
      correctReading(created.sessionId, 0, marks("....X....")),
    ).rejects.toThrow(/Check the board first/);
  });
});
