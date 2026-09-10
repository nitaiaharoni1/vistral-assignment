import { describe, expect, it } from "vitest";
import { drawOInstruction } from "./types";
import {
  addEvent,
  cellLabel,
  cellVisible,
  checkVisibleChange,
  createSession,
  damagedCellMessage,
  expectedMark,
  hasPendingMove,
  instruction,
  isUnexpectedMark,
  pauseSession,
  rejectChange,
  resetStability,
  resumeSession,
  stableCell,
} from "./session.helpers";
import { marks, session } from "../tests/helpers/boards.ts";

describe("createSession", () => {
  it("starts a live game on X's turn", () => {
    const next = createSession();
    expect(next.mode).toBe("play");
    expect(next.phase).toBe("human");
    expect(next.board).toEqual(Array(9).fill(null));
    expect(next.events[0]?.kind).toBe("start");
    expect(next.message).toMatch(/empty grid/);
  });

  it("uses replay copy when asked", () => {
    const next = createSession("replay");
    expect(next.mode).toBe("replay");
    expect(next.message).toMatch(/recording/);
  });
});

describe("session messages", () => {
  it("names cells with both words and ids", () => {
    expect(cellLabel(4)).toBe("center (B2)");
    expect(cellLabel(0)).toBe("top left (A1)");
    expect(drawOInstruction(4)).toBe("Draw O in the center.");
    expect(drawOInstruction(0)).toBe("Draw O in the top left.");
  });

  it("asks for X on the human turn and O while drawing", () => {
    expect(expectedMark(session())).toBe("X");
    expect(expectedMark(session({ phase: "draw-ai" }))).toBe("O");
  });

  it("flags the wrong mark and a misplaced pending O", () => {
    expect(isUnexpectedMark(session(), "O", 0)).toBe(true);
    expect(
      isUnexpectedMark(session({ phase: "draw-ai", pendingMove: 4 }), "O", 0),
    ).toBe(true);
    expect(
      isUnexpectedMark(session({ phase: "draw-ai", pendingMove: 4 }), "O", 4),
    ).toBe(false);
  });

  it("explains a damaged confirmed cell", () => {
    const play = session({ board: marks("X........") });
    expect(damagedCellMessage(play, 0)).toMatch(/must still contain X/);
    expect(
      damagedCellMessage(session({ mode: "replay", board: play.board }), 0),
    ).toMatch(/recording/);
  });
});

describe("instruction", () => {
  it("announces a finished live game", () => {
    expect(
      instruction(session({ phase: "finished", board: marks("XXXOO....") })),
    ).toMatch(/You win/);
    expect(
      instruction(session({ phase: "finished", board: marks("OOOXX.X..") })),
    ).toMatch(/O wins/);
    expect(
      instruction(session({ phase: "finished", board: marks("XOXOOXXXO") })),
    ).toMatch(/draw/);
  });

  it("announces a finished replay", () => {
    expect(
      instruction(
        session({
          mode: "replay",
          phase: "finished",
          board: marks("XXXOO...."),
        }),
      ),
    ).toMatch(/X wins/);
  });

  it("tells the person where to draw O", () => {
    expect(instruction(session({ phase: "draw-ai", pendingMove: 4 }))).toMatch(
      /Draw O in center/,
    );
  });

  it("asks for X on a live turn and watches replay", () => {
    expect(instruction(session())).toMatch(/Draw one X/);
    expect(instruction(session({ mode: "replay" }))).toMatch(/Watching X/);
    expect(instruction(session({ mode: "replay", phase: "draw-ai" }))).toMatch(
      /Watching O/,
    );
  });
});

describe("session lifecycle", () => {
  it("only reports a pending move during live draw-ai", () => {
    expect(hasPendingMove(session({ phase: "draw-ai", pendingMove: 4 }))).toBe(
      true,
    );
    expect(
      hasPendingMove(
        session({ mode: "replay", phase: "draw-ai", pendingMove: 4 }),
      ),
    ).toBe(false);
  });

  it("pauses once and resumes once", () => {
    const started = session();
    const paused = pauseSession(started);
    expect(paused.paused).toBe(true);
    expect(paused.events.at(-1)?.kind).toBe("pause");
    expect(pauseSession(paused).events).toHaveLength(paused.events.length);
    const resumed = resumeSession(paused);
    expect(resumed.paused).toBe(false);
    expect(resumeSession(resumed)).toBe(resumed);
  });

  it("records a new recovery once, then repeats the same reason quietly", () => {
    const first = rejectChange(session(), "Restore the X.", 10);
    expect(first.events.at(-1)?.kind).toBe("recovery");
    const second = rejectChange(first, "Restore the X.", 20);
    expect(second.events).toHaveLength(first.events.length);
    expect(second.recoveryReason).toBe("Restore the X.");
  });

  it("only rejects a visible change once it is stable", () => {
    const checking = checkVisibleChange(session(), "changed", 10, false);
    expect(checking.checkingChange).toBe(true);
    const rejected = checkVisibleChange(session(), "changed", 10, true);
    expect(rejected.recoveryReason).toBe("changed");
  });

  it("clears stability fields", () => {
    const reset = resetStability(
      session({
        stableFrames: 4,
        stableSince: 1,
        candidateKey: "X........",
        checkingChange: true,
      }),
    );
    expect(reset.stableFrames).toBe(0);
    expect(reset.candidateKey).toBeNull();
    expect(reset.checkingChange).toBe(false);
  });

  it("numbers events in order", () => {
    const next = addEvent(session(), { at: 1, kind: "note", message: "hi" });
    expect(next.events.at(-1)?.id).toBe("event-2");
  });
});

describe("cellVisible and stableCell", () => {
  it("requires a finite confidence in range and a real mark", () => {
    expect(
      cellVisible({ mark: "X", confidence: 0.78, ink: 0.1, readable: true }),
    ).toBe(true);
    expect(
      cellVisible({ mark: "?", confidence: 0.99, ink: 0.1, readable: true }),
    ).toBe(false);
    expect(
      cellVisible({ mark: "X", confidence: 0.77, ink: 0.1, readable: true }),
    ).toBe(false);
    expect(
      cellVisible({ mark: "X", confidence: 1.1, ink: 0.1, readable: true }),
    ).toBe(false);
  });

  it("needs five frames and 500 ms", () => {
    expect(stableCell(null, 1000)).toBe(false);
    expect(
      stableCell({ mark: "X", frames: 5, since: 500, lastSeen: 1000 }, 1000),
    ).toBe(true);
    expect(
      stableCell({ mark: "X", frames: 4, since: 0, lastSeen: 1000 }, 1000),
    ).toBe(false);
    expect(
      stableCell({ mark: "X", frames: 5, since: 600, lastSeen: 1000 }, 1000),
    ).toBe(false);
  });
});
