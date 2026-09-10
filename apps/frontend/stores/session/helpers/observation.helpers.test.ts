import { describe, expect, it } from "vitest";
import { pauseSession, resumeSession } from "@shared/session.helpers";
import { resumeBoard } from "@shared/accept-session";
import {
  keyOf,
  marks,
  observation,
  times,
} from "../../../../../tests/helpers/boards.ts";
import { observe } from "./observation.helpers";

const OPENING = ".O.XXO...";
const FINAL = ".OXXXOX.O";

function feed(
  start: ReturnType<typeof resumeBoard>,
  key: string,
  stamps: number[],
  hidden: number[] = [],
) {
  return stamps.reduce(
    (state, timestamp) => observe(state, observation(key, timestamp, hidden)),
    start,
  );
}

describe("observe", () => {
  it("confirms a stable new X in live play", () => {
    let state = resumeBoard(marks("........."));
    state = feed(state, "....X....", times(0, 600));
    expect(keyOf(state.board)).toBe("....X....");
    expect(state.phase).toBe("draw-ai");
  });

  it("ignores a timestamp that does not move forward", () => {
    const first = observe(
      resumeBoard(marks(".........")),
      observation("....X....", 10),
    );
    const again = observe(first, observation("....X....", 10));
    expect(again).toBe(first);
  });

  it("does not finish a replay from a partial last board", () => {
    const state = feed(
      resumeBoard(marks(OPENING), "replay"),
      FINAL,
      times(0, 2000),
      [0],
    );
    expect(keyOf(state.board)).toBe(OPENING);
    expect(state.phase).not.toBe("finished");
  });

  it("syncs a fully visible legal replay board after a 500 ms window", () => {
    let state = feed(
      resumeBoard(marks(OPENING), "replay"),
      FINAL,
      times(0, 600),
      [0],
    );
    expect(keyOf(state.board)).toBe(OPENING);
    state = observe(state, observation(FINAL, 700));
    expect(keyOf(state.board)).toBe(FINAL);
    expect(state.phase).toBe("finished");
  });

  it("cannot confirm replay additions in 499 ms", () => {
    let state = feed(
      resumeBoard(marks(OPENING), "replay"),
      FINAL,
      times(0, 450, 50),
      [0],
    );
    state = observe(state, observation(FINAL, 499));
    expect(keyOf(state.board)).toBe(OPENING);
    state = observe(state, observation(FINAL, 500));
    expect(keyOf(state.board)).toBe(FINAL);
  });

  it("rejects an illegal accumulated replay board", () => {
    const state = feed(
      resumeBoard(marks(OPENING), "replay"),
      ".OXXXOXOO",
      times(0, 700),
    );
    expect(keyOf(state.board)).toBe(OPENING);
    expect(state.recoveryReason).toBeTruthy();
  });

  it("discards evidence across pause, darkness, and a stale gap", () => {
    const opening = resumeBoard(marks(OPENING), "replay");
    let paused = feed(opening, FINAL, times(0, 600), [0]);
    paused = feed(resumeSession(pauseSession(paused)), FINAL, times(700, 1100));
    expect(keyOf(paused.board)).toBe(OPENING);
    let dark = feed(opening, FINAL, times(0, 600), [0]);
    dark = observe(dark, observation(FINAL, 650, [], { quality: "dark" }));
    dark = feed(dark, FINAL, times(700, 1100));
    expect(keyOf(dark.board)).toBe(OPENING);
    let stale = feed(opening, FINAL, times(0, 600), [0]);
    stale = observe(stale, observation(FINAL, 2200));
    expect(keyOf(stale.board)).toBe(OPENING);
  });

  it("rejects several new live marks and a misplaced O", () => {
    const extras = feed(resumeBoard(marks(OPENING)), FINAL, times(0, 600), [0]);
    expect(extras.recoveryReason).toBeTruthy();
    const start = resumeBoard(marks(".O.XX...."));
    const wrong = start.board.map((mark, cell) =>
      mark === null && cell !== start.pendingMove ? "O" : mark,
    );
    const key = wrong.map((mark) => mark ?? ".").join("");
    const misplaced = feed(start, key, times(0, 600));
    expect(keyOf(misplaced.board)).toBe(".O.XX....");
    expect(misplaced.recoveryReason).toBeTruthy();
  });

  it("keeps confirmed marks when the page later looks empty", () => {
    let state = resumeBoard(marks(FINAL), "replay");
    state = feed(state, ".........", times(0, 600));
    expect(keyOf(state.board)).toBe(FINAL);
    state = observe(
      state,
      observation(".........", 700, [], { quality: "misaligned" }),
    );
    expect(keyOf(state.board)).toBe(FINAL);
  });

  it("does not add marks after a finished game", () => {
    const postWin = marks(FINAL);
    postWin[0] = "O";
    postWin[7] = "X";
    const state = feed(
      resumeBoard(marks(FINAL), "replay"),
      postWin.map((mark) => mark ?? ".").join(""),
      times(0, 700),
    );
    expect(keyOf(state.board)).toBe(FINAL);
  });

  it("reacquires the grid and then waits for the confirmed marks", () => {
    const start = resumeBoard(marks("X........"));
    const next = observe(
      start,
      observation("X........", 10, [], {
        reacquired: true,
        quality: "dark",
      }),
    );
    expect(next.boardCheck).toBe("interrupted");
    expect(next.message).toMatch(/Grid found again/);
  });

  it("rejects a stable unexpected O on X's turn", () => {
    let state = resumeBoard(marks("........."));
    state = feed(state, "O........", times(0, 600));
    expect(keyOf(state.board)).toBe(".........");
    expect(state.recoveryReason).toMatch(/needs X/);
  });
});
