import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { createSession } from "@shared/session-helpers/session.helpers";
import { observation } from "../../../../tests/helpers/boards.ts";
import { session } from "../../../../tests/helpers/boards.ts";
import { nextActionCopy } from "./next-action-copy";
import { nextActionNeedsAttention } from "./next-action-copy";
import { nextActionNewGameLabel } from "./next-action-copy";
import { nextActionShowsNewGame } from "./next-action-copy";
import type { NextActionSource } from "./next-action-copy";

// Builds a default next-action source for tests.
function source(overrides: Partial<NextActionSource> = {}): NextActionSource {
  return {
    stage: "playing",
    needsRestart: false,
    error: "",
    detectionHint: "",
    session: createSession(),
    observation: null,
    ...overrides,
  };
}

describe("nextActionCopy", () => {
  it("announces the outcome first", () => {
    expect(
      nextActionCopy(
        source({
          session: session({
            phase: "finished",
            board: ["X", "X", "X", "O", "O", null, null, null, null],
          }),
        }),
      ),
    ).toMatchObject({ title: "You win.", symbol: "x" });
    expect(
      nextActionCopy(
        source({
          session: session({
            mode: "replay",
            phase: "finished",
            board: ["O", "O", "O", "X", "X", null, "X", null, null],
          }),
        }),
      ).title,
    ).toMatch(/O wins the recorded game/);
  });

  it("covers restart, detecting, setup, and pause", () => {
    expect(nextActionCopy(source({ needsRestart: true, error: "Camera lost." }))).toMatchObject({ title: "Let’s reconnect.", symbol: "eye" });
    expect(nextActionCopy(source({ stage: "detecting" }))).toMatchObject({
      title: "Reading your board…",
    });
    expect(nextActionCopy(source({ stage: "calibrating" }))).toMatchObject({
      symbol: "eye",
    });
    expect(nextActionCopy(source({ session: session({ paused: true }) }))).toMatchObject({ title: "Paused.", symbol: "pause" });
  });

  it("watches replay and guides a pending O", () => {
    expect(nextActionCopy(source({ session: session({ mode: "replay" }) }))).toMatchObject({ title: "Watching X.", symbol: "eye" });
    const pending = session({ phase: "draw-ai", pendingMove: 4 });
    expect(nextActionCopy(source({ session: pending }))).toMatchObject({
      title: "Draw O in the center.",
      symbol: "o",
    });
    pending.recognizedBoard[4] = "O";
    expect(nextActionCopy(source({ session: pending })).title).toBe("O detected.");
  });

  it("guides a human X and a recovery", () => {
    const visible = observation("X........", 10);
    visible.cells[0].readable = true;
    expect(nextActionCopy(source({ observation: visible })).guidance).toMatch(/Hold your X still/);
    expect(
      nextActionCopy(
        source({
          session: session({
            phase: "draw-ai",
            pendingMove: null,
            recoveryReason: "Restore the X.",
          }),
        }),
      ),
    ).toMatchObject({
      title: "This move needs correcting.",
      symbol: "warning",
    });
  });

  it("announces Paperplay, a draw, and a recorded draw", () => {
    expect(
      nextActionCopy(
        source({
          session: session({
            phase: "finished",
            board: ["O", "O", "O", "X", "X", null, "X", null, null],
          }),
        }),
      ),
    ).toMatchObject({ title: "Paperplay wins.", symbol: "o" });
    expect(
      nextActionCopy(
        source({
          session: session({
            phase: "finished",
            board: ["X", "O", "X", "O", "O", "X", "X", "X", "O"],
          }),
        }),
      ).title,
    ).toMatch(/draw/);
    expect(
      nextActionCopy(
        source({
          session: session({
            mode: "replay",
            phase: "finished",
            board: ["X", "O", "X", "O", "O", "X", "X", "X", "O"],
          }),
        }),
      ).title,
    ).toBe("The recorded game is a draw.");
  });

  it("asks for a clearer view, then waits while the page is unread", () => {
    expect(
      nextActionCopy(
        source({
          session: session({ phase: "draw-ai", pendingMove: null }),
          observation: observation(".........", 10, { quality: "dark" }),
        }),
      ),
    ).toMatchObject({ title: "A clearer view, please.", symbol: "eye" });
    expect(
      nextActionCopy(
        source({
          session: session({
            phase: "draw-ai",
            pendingMove: null,
            pageMatchesBoard: false,
            boardCheck: "finding-grid",
            message: "Show the whole grid.",
          }),
        }),
      ),
    ).toMatchObject({
      title: "Reading the paper…",
      guidance: "Show the whole grid.",
    });
  });

  it("uses setup and detecting hints, and watches replay O", () => {
    expect(nextActionCopy(source({ stage: "corners", error: "Grid slipped." })).title).toBe("Let’s get a clearer view.");
    expect(nextActionCopy(source({ stage: "detecting", detectionHint: "Tilt less." })).guidance).toBe("Tilt less.");
    expect(
      nextActionCopy(
        source({
          session: session({ mode: "replay", phase: "draw-ai" }),
        }),
      ).title,
    ).toBe("Watching O.");
  });
});

describe("nextAction flags", () => {
  it("shows a new-game button after a result or a forced restart", () => {
    const finished = source({
      session: session({
        phase: "finished",
        board: ["X", "X", "X", "O", "O", null, null, null, null],
      }),
    });
    expect(nextActionShowsNewGame(finished)).toBe(true);
    expect(nextActionNewGameLabel(finished)).toBe("Play again");
    expect(nextActionNeedsAttention(finished)).toBe(false);
    expect(nextActionShowsNewGame(source({ needsRestart: true }))).toBe(true);
    expect(nextActionNewGameLabel(source({ needsRestart: true }))).toBe("New session");
  });

  it("asks for attention on a bad human move, not during setup", () => {
    expect(nextActionNeedsAttention(source({ session: session({ recoveryReason: "Wrong mark." }) }))).toBe(true);
    expect(nextActionNeedsAttention(source({ stage: "calibrating" }))).toBe(false);
    expect(
      nextActionNeedsAttention(
        source({
          session: session({ phase: "draw-ai", pendingMove: null }),
          observation: observation(".........", 10, { quality: "moving" }),
        }),
      ),
    ).toBe(true);
  });

  it("labels a replay result as a new session", () => {
    expect(
      nextActionNewGameLabel(
        source({
          session: session({
            mode: "replay",
            phase: "finished",
            board: ["X", "X", "X", "O", "O", null, null, null, null],
          }),
        }),
      ),
    ).toBe("New session");
  });
});
