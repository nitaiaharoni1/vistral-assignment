import { describe, expect, it } from "vitest";
import { createSession } from "@shared/session.helpers";
import {
  observation,
  session,
} from "../../../../../../tests/helpers/boards.ts";
import {
  boardAnalysisLabel,
  buildOverlayView,
  isOverlayReadable,
  overlayAriaLabel,
  type OverlayGameSnapshot,
} from "./detection-overlay-cell-state";
import { buildOverlayGeometry } from "./detection-overlay-geometry";

const CORNERS = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

function game(
  overrides: Partial<OverlayGameSnapshot> = {},
): OverlayGameSnapshot {
  return {
    stage: "playing",
    error: "",
    session: createSession(),
    observation: observation(".........", 10),
    detectedBoard: null,
    ...overrides,
  };
}

describe("isOverlayReadable", () => {
  it("needs an in-game, unpaused, well-lit nine-cell observation", () => {
    expect(isOverlayReadable(game())).toBe(true);
    expect(isOverlayReadable(game({ stage: "detecting" }))).toBe(false);
    expect(
      isOverlayReadable(game({ session: session({ paused: true }) })),
    ).toBe(false);
    expect(
      isOverlayReadable(
        game({
          observation: observation(".........", 10, [], { quality: "dark" }),
        }),
      ),
    ).toBe(false);
  });
});

describe("buildOverlayView", () => {
  const geometry = buildOverlayGeometry(CORNERS)!;

  it("marks confirmed, pending, and rejected cells", () => {
    const current = session({
      board: ["X", null, null, null, null, null, null, null, null],
      recognizedBoard: ["X", "O", null, null, null, null, null, null, null],
      phase: "draw-ai",
      pendingMove: 4,
      pageMatchesBoard: true,
    });
    const view = buildOverlayView(game({ session: current }), geometry);
    expect(view.cells[0].state).toBe("confirmed");
    expect(view.cells[1].state).toBe("rejected");
    expect(view.cells[4].state).toBe("pending");
    expect(view.targetHint).toMatch(/Draw O/);
    expect(view.verified).toBe(true);
  });

  it("draws the winning line on a finished game", () => {
    const view = buildOverlayView(
      game({
        session: session({
          phase: "finished",
          board: ["X", "X", "X", "O", "O", null, null, null, null],
        }),
      }),
      geometry,
    );
    expect(view.outcome?.outcome).toBe("X");
    expect(view.first).toEqual(geometry.cells[0].center);
    expect(view.last).toEqual(geometry.cells[2].center);
    expect(view.label).toMatch(/X wins/);
  });

  it("builds a spoken label for every square", () => {
    const view = buildOverlayView(game(), geometry);
    const spoken = overlayAriaLabel(view.label, view.cells, view.targetHint);
    expect(spoken).toMatch(/top left: empty/);
    expect(spoken).toMatch(/9 detected/);
  });
});

describe("boardAnalysisLabel", () => {
  it("speaks only while the board is still being found", () => {
    expect(boardAnalysisLabel(game({ stage: "detecting" }))).toBe(
      "Finding the board…",
    );
    expect(boardAnalysisLabel(game({ stage: "calibrating" }))).toBe(
      "Checking the board…",
    );
    expect(boardAnalysisLabel(game(), true)).toBeNull();
    expect(boardAnalysisLabel(game({ error: "nope" }))).toBeNull();
    expect(boardAnalysisLabel(game(), false)).toBe("Finding the board…");
  });
});

describe("overlay extras", () => {
  const geometry = buildOverlayGeometry(CORNERS)!;

  it("does not pulse checking marks for the remote agent", () => {
    const seen = observation("X........", 10);
    seen.cells[0].ink = 0.05;
    const view = buildOverlayView(
      game({
        usesRemoteAgent: true,
        observation: seen,
        session: session({
          cellReadingStartedAt: [10, ...Array(8).fill(null)],
        }),
      }),
      geometry,
    );
    expect(view.cells[0].checking).toBe(false);
  });

  it("marks a fresh unread ink as a candidate", () => {
    const seen = observation("X........", 10);
    seen.cells[0].ink = 0.05;
    const view = buildOverlayView(
      game({
        observation: seen,
        session: session({
          cellReadingStartedAt: [10, ...Array(8).fill(null)],
        }),
      }),
      geometry,
    );
    expect(view.cells[0].state).toBe("candidate");
    expect(view.cells[0].checking).toBe(true);
  });

  it("hides cell marks on a dark or crooked frame", () => {
    expect(
      isOverlayReadable(
        game({
          observation: observation(".........", 10, [], {
            quality: "misaligned",
          }),
        }),
      ),
    ).toBe(false);
  });

  it("says O is already visible in the pending square", () => {
    const current = session({
      phase: "draw-ai",
      pendingMove: 4,
      recognizedBoard: [null, null, null, null, "O", null, null, null, null],
      pageMatchesBoard: true,
    });
    const view = buildOverlayView(game({ session: current }), geometry);
    expect(view.targetHint).toMatch(/O detected/);
  });
});
