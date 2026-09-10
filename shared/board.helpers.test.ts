import { describe, expect, it } from "vitest";
import {
  addedCells,
  checkLegality,
  chooseMove,
  getOutcome,
  phaseForBoard,
  sameBoard,
} from "./board.helpers";
import { keyOf, marks } from "../tests/helpers/boards.ts";

describe("getOutcome", () => {
  it("finds every winning line for X and O", () => {
    const lines = [
      "XXX......",
      "...XXX...",
      "......XXX",
      "X..X..X..",
      ".X..X..X.",
      "..X..X..X",
      "X...X...X",
      "..X.X.X..",
    ];
    for (const key of lines) {
      expect(getOutcome(marks(key))).toMatchObject({
        outcome: "X",
        winningLine: expect.any(Array),
      });
      expect(getOutcome(marks(key.replaceAll("X", "O")))).toMatchObject({
        outcome: "O",
      });
    }
  });

  it("reports a draw only when the board is full with no winner", () => {
    expect(getOutcome(marks("XOXOOXXXO"))).toEqual({
      outcome: "draw",
      winningLine: null,
    });
    expect(getOutcome(marks("XOXOX...."))).toEqual({
      outcome: null,
      winningLine: null,
    });
  });

  it("rejects boards that are not nine cells", () => {
    expect(getOutcome(["X", "O"])).toEqual({
      outcome: null,
      winningLine: null,
    });
  });
});

describe("checkLegality", () => {
  it("accepts an empty board and a normal opening", () => {
    expect(checkLegality(marks(".........")).valid).toBe(true);
    expect(checkLegality(marks("....X....")).valid).toBe(true);
    expect(checkLegality(marks("O...X....")).valid).toBe(true);
  });

  it("rejects the wrong length or an unknown mark", () => {
    expect(checkLegality(["X"]).valid).toBe(false);
    expect(checkLegality(["Z", ...Array(8).fill(null)] as never).valid).toBe(
      false,
    );
  });

  it("rejects O moving first and two extra X marks", () => {
    expect(checkLegality(marks("O........")).reason).toMatch(/X starts/);
    expect(checkLegality(marks("XX.......")).reason).toMatch(/X starts/);
  });

  it("rejects both players winning and play after a win", () => {
    expect(checkLegality(marks("XXXOOO...")).reason).toMatch(/Both players/);
    expect(checkLegality(marks("XXXOO...O")).reason).toMatch(/after X wins/);
    expect(checkLegality(marks("XX.OOO.XX")).reason).toMatch(/after O wins/);
  });
});

describe("chooseMove", () => {
  it("returns null when it is not O's turn or the game is over", () => {
    expect(chooseMove(marks("........."))).toBeNull();
    expect(chooseMove(marks("XXXOO...."))).toBeNull();
    expect(chooseMove(marks("O........"))).toBeNull();
  });

  it("takes an immediate win before blocking", () => {
    expect(chooseMove(marks("OO.XX.X.."))).toBe(2);
  });

  it("blocks an immediate X win", () => {
    expect(chooseMove(marks("XX..O...."))).toBe(2);
  });

  it("prefers the center after a corner opening", () => {
    expect(chooseMove(marks("X........"))).toBe(4);
  });

  it("answers a center opening with a corner", () => {
    expect(chooseMove(marks("....X...."))).toBe(0);
  });
});

describe("board helpers", () => {
  it("lists only newly occupied cells", () => {
    expect(addedCells(marks("X........"), marks("X.O......"))).toEqual([2]);
    expect(addedCells(marks("........."), marks("X...O...."))).toEqual([0, 4]);
  });

  it("compares boards cell by cell", () => {
    expect(sameBoard(marks("X.O......"), marks("X.O......"))).toBe(true);
    expect(sameBoard(marks("X.O......"), marks("X........"))).toBe(false);
  });

  it("sets the phase from the outcome and turn count", () => {
    expect(phaseForBoard(marks("........."), null)).toBe("human");
    expect(phaseForBoard(marks("....X...."), null)).toBe("draw-ai");
    expect(phaseForBoard(marks("XXXOO...."), "X")).toBe("finished");
  });

  it("keeps the board key helper honest for tests", () => {
    expect(keyOf(marks("X.O......"))).toBe("X.O......");
  });
});
