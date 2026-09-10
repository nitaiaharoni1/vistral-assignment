import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { acceptStableBoard } from "./accept-session";
import { confirmMove } from "./accept-session";
import { resumeBoard } from "./accept-session";
import { createSession } from "../session-helpers/session.helpers";
import { keyOf } from "../../tests/helpers/boards.ts";
import { marks } from "../../tests/helpers/boards.ts";
import { session } from "../../tests/helpers/boards.ts";

describe("resumeBoard", () => {
  it("imports a legal mid-game board and picks O when needed", () => {
    const next = resumeBoard(marks("....X...."));
    expect(next.phase).toBe("draw-ai");
    expect(next.pendingMove).toBe(0);
    expect(next.events.some((event) => event.kind === "ai-intent")).toBe(true);
    expect(next.pageMatchesBoard).toBe(false);
    expect(next.boardCheck).toBe("ready");
  });

  it("imports a finished board without an intended O", () => {
    const next = resumeBoard(marks("XXXOO...."));
    expect(next.phase).toBe("finished");
    expect(next.pendingMove).toBeNull();
    expect(next.outcome).toBe("X");
  });

  it("does not invent a pending move in replay", () => {
    const next = resumeBoard(marks("....X...."), "replay");
    expect(next.pendingMove).toBeNull();
    expect(next.events[0]?.kind).toBe("board-imported");
  });

  it("throws on an illegal board", () => {
    expect(() => resumeBoard(marks("XX......."))).toThrow(/X starts/);
  });
});

describe("confirmMove", () => {
  it("confirms X and asks for O in live play", () => {
    const board = marks("....X....");
    const next = confirmMove({ session: createSession(), board, cell: 4, at: 100 });
    expect(next.board[4]).toBe("X");
    expect(next.phase).toBe("draw-ai");
    expect(next.pendingMove).toBe(0);
    expect(next.events.some((event) => event.kind === "human-move")).toBe(true);
    expect(next.events.some((event) => event.kind === "ai-intent")).toBe(true);
  });

  it("closes the game when the confirmed mark wins", () => {
    const previous = session({
      board: marks("XX.OO...."),
      phase: "human",
    });
    const next = confirmMove({ session: previous, board: marks("XXXOO...."), cell: 2, at: 50 });
    expect(next.phase).toBe("finished");
    expect(next.events.some((event) => event.kind === "result")).toBe(true);
  });

  it("only observes marks in replay, without choosing O", () => {
    const previous = session({ mode: "replay" });
    const next = confirmMove({ session: previous, board: marks("....X...."), cell: 4, at: 10 });
    expect(next.phase).toBe("draw-ai");
    expect(next.pendingMove).toBeNull();
    expect(next.events.at(-1)?.kind).toBe("observed-move");
  });
});

describe("acceptStableBoard", () => {
  it("accepts one new X and then the intended O", () => {
    const afterX = acceptStableBoard(createSession(), marks("....X...."), 10);
    expect(afterX.phase).toBe("draw-ai");
    const afterO = acceptStableBoard(
      afterX,
      marks(
        (() => {
          const next = [...afterX.board];
          next[afterX.pendingMove!] = "O";
          return keyOf(next);
        })(),
      ),
      20,
    );
    expect(afterO.phase).toBe("human");
    expect(afterO.pendingMove).toBeNull();
  });

  it("rejects a damaged confirmed mark", () => {
    const started = session({ board: marks("X........") });
    const next = acceptStableBoard(started, marks("........."), 10);
    expect(next.recoveryReason).toMatch(/must still contain X/);
    expect(keyOf(next.board)).toBe("X........");
  });

  it("rejects extra live marks and a misplaced O", () => {
    const afterX = acceptStableBoard(createSession(), marks("X........"), 10);
    const extras = acceptStableBoard(afterX, marks("X.X.O...."), 20);
    expect(extras.recoveryReason).toMatch(/2 new marks/);
    const wrongO = [...afterX.board];
    const other = wrongO.findIndex((mark, cell) => mark === null && cell !== afterX.pendingMove);
    wrongO[other] = "O";
    const misplaced = acceptStableBoard(afterX, wrongO, 30);
    expect(misplaced.recoveryReason).toMatch(/O belongs/);
  });

  it("rejects an O when X is expected", () => {
    const next = acceptStableBoard(createSession(), marks("O........"), 10);
    expect(next.recoveryReason).toMatch(/needs X/);
  });

  it("syncs several legal replay additions and rejects illegal ones", () => {
    const opening = resumeBoard(marks(".O.XXO..."), "replay");
    const synced = acceptStableBoard(opening, marks(".OXXXOX.O"), 10);
    expect(keyOf(synced.board)).toBe(".OXXXOX.O");
    expect(synced.phase).toBe("finished");
    expect(synced.events.some((event) => event.kind === "board-sync")).toBe(true);
    const illegal = acceptStableBoard(opening, marks(".OXXXOXOO"), 10);
    expect(illegal.recoveryReason).toBeTruthy();
    expect(keyOf(illegal.board)).toBe(".O.XXO...");
  });

  it("rejects marks added after the game ended", () => {
    const finished = resumeBoard(marks("XXXOO...."));
    const next = acceptStableBoard(finished, marks("XXXOOX..."), 10);
    expect(next.recoveryReason).toMatch(/after the game ended/);
  });

  it("clears a recovery when the paper matches again", () => {
    const recovered = acceptStableBoard(
      session({
        board: marks("X........"),
        recoveryReason: "Restore the X.",
      }),
      marks("X........"),
      10,
    );
    expect(recovered.recoveryReason).toBeNull();
    expect(recovered.pageMatchesBoard).toBe(true);
    expect(recovered.events.some((event) => event.kind === "recovered")).toBe(true);
  });
});
