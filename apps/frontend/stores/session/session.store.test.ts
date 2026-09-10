import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { marks } from "../../../../tests/helpers/boards.ts";
import { observation } from "../../../../tests/helpers/boards.ts";
import { SessionStore } from "./session.store";

describe("SessionStore", () => {
  it("resets, pauses, resumes, and observes", () => {
    const store = new SessionStore();
    store.session.board = marks("X........");
    store.reset("replay");
    expect(store.session.mode).toBe("replay");
    expect(store.session.board.every((cell) => cell === null)).toBe(true);
    store.pause();
    expect(store.session.paused).toBe(true);
    store.resume();
    expect(store.session.paused).toBe(false);
    store.observe(observation(".........", 10));
    expect(store.session.lastObservationAt).toBe(10);
  });

  it("imports a board on the first detection, then only re-verifies later", () => {
    const store = new SessionStore();
    store.resumeFromBoard(marks("....X...."), "play");
    expect(store.session.board[4]).toBe("X");
    expect(store.session.phase).toBe("draw-ai");
    store.resumeFromBoard(marks("........."), "play");
    expect(store.session.board[4]).toBe("X");
    expect(store.session.boardCheck).toBe("verifying-grid");
    expect(store.session.paused).toBe(false);
  });
});
