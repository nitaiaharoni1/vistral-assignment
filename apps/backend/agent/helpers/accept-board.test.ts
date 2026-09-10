import { describe, expect, it } from "vitest";
import { acceptAnalysis, preservePendingMove } from "./accept-board";
import { resumeBoard } from "../../../../shared/accept-session";
import { analysis, marks, session } from "../../../../tests/helpers/boards.ts";
import {
  gameWithSession,
  savedGame,
} from "../../../../tests/helpers/agent-fixtures.ts";

describe("preservePendingMove", () => {
  it("keeps the previous O when the board did not change", () => {
    const previous = session({ board: marks("....X...."), pendingMove: 0 });
    const next = session({ board: marks("....X...."), pendingMove: 8 });
    expect(preservePendingMove(next, previous).pendingMove).toBe(0);
  });

  it("does not keep a stale O after the board changes", () => {
    const previous = session({ board: marks("....X...."), pendingMove: 0 });
    const next = session({ board: marks("X...O...."), pendingMove: 8 });
    expect(preservePendingMove(next, previous).pendingMove).toBe(8);
  });
});

describe("acceptAnalysis", () => {
  it("holds an unclear reading without changing the session", () => {
    const game = savedGame();
    const unclear = acceptAnalysis(
      game,
      analysis("????.....", { clear: false }),
    );
    expect(unclear.status).toBe("uncertain");
    expect(unclear.decisionSource).toBe("saved");
    expect(game.initialized).toBe(false);
  });

  it("holds a low-confidence cell as uncertain", () => {
    const game = savedGame();
    const reading = analysis("....X....");
    reading.cells[4] = { mark: "X", confidence: 0.84 };
    expect(acceptAnalysis(game, reading).status).toBe("uncertain");
  });

  it("rejects an illegal clear board", () => {
    const game = savedGame();
    const next = acceptAnalysis(game, analysis("XX......."));
    expect(next.status).toBe("rejected");
    expect(next.message).toMatch(/X starts/);
  });

  it("imports the first legal board and lets minimax choose O", () => {
    const game = savedGame();
    const next = acceptAnalysis(game, analysis("....X...."));
    expect(next.status).toBe("ready");
    expect(game.initialized).toBe(true);
    expect(next.session.pendingMove).toBe(0);
    expect(next.decisionSource).toBe("rules");
  });

  it("keeps a saved pending O on an unchanged later reading", () => {
    const current = resumeBoard(marks("....X...."));
    current.pendingMove = 8;
    const game = gameWithSession(current);
    const next = acceptAnalysis(game, analysis("....X...."));
    expect(next.session.pendingMove).toBe(8);
    expect(next.decisionSource).toBe("saved");
  });

  it("accepts O drawn in a different empty square and explains it", () => {
    const current = resumeBoard(marks("X........"));
    const intended = current.pendingMove!;
    const drawn = current.board.findIndex(
      (mark, cell) => mark === null && cell !== intended,
    );
    const key = current.board
      .map((mark, cell) => (cell === drawn ? "O" : (mark ?? ".")))
      .join("");
    const game = gameWithSession(current);
    const next = acceptAnalysis(game, analysis(key));
    expect(next.status).toBe("ready");
    expect(next.notice).toMatch(/O accepted/);
    expect(next.session.board[drawn]).toBe("O");
    expect(
      next.session.events.some(
        (event) => event.kind === "ai-placement-changed",
      ),
    ).toBe(true);
  });

  it("rejects extra marks after the game is already initialized", () => {
    const game = gameWithSession(resumeBoard(marks("X........")));
    const next = acceptAnalysis(game, analysis("XXX......"));
    expect(next.status).toBe("rejected");
  });

  it("imports a finished first board without asking for O", () => {
    const game = savedGame();
    const next = acceptAnalysis(game, analysis("XXXOO...."));
    expect(next.status).toBe("ready");
    expect(next.session.phase).toBe("finished");
    expect(next.session.pendingMove).toBeNull();
    expect(game.initialized).toBe(true);
  });
});
