import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { resumeBoard } from "@shared/accept-session/accept-session";
import { REQUIRED_STABLE_FRAMES } from "@shared/session-helpers/session.helpers";
import { marks } from "../../../../../tests/helpers/boards.ts";
import { observation } from "../../../../../tests/helpers/boards.ts";
import { session } from "../../../../../tests/helpers/boards.ts";
import { advanceRecognizedTurn } from "./cell-recognition.helpers";
import { updateCandidates } from "./cell-recognition.helpers";

// Returns nine visible squares.
function visibleNine() {
  return Array(9).fill(true);
}

// Builds nine already-stable cell candidates.
function stableCandidates(mark: "X" | "O" | null = "X") {
  return Array.from({ length: 9 }, () => ({
    mark,
    frames: REQUIRED_STABLE_FRAMES,
    since: 0,
    lastSeen: 1000,
  }));
}

describe("updateCandidates", () => {
  it("leaves the session alone without local readings", () => {
    const current = session();
    expect(updateCandidates({ session: current, observation: observation(".........", 10), visible: visibleNine(), at: 10, localReadings: false })).toBe(current);
  });

  it("promotes a stable visible X onto the recognized board", () => {
    const current = session({
      cellCandidates: Array.from({ length: 9 }, (_, cell) => (cell === 4 ? { mark: "X" as const, frames: 4, since: 0, lastSeen: 400 } : null)),
    });
    const next = updateCandidates({ session: current, observation: observation("....X....", 1000), visible: visibleNine(), at: 1000, localReadings: true });
    expect(next.recognizedBoard[4]).toBe("X");
    expect(next.cellCandidates[4]?.frames).toBe(REQUIRED_STABLE_FRAMES);
  });

  it("forgets a candidate after the reading gap", () => {
    const current = session({
      cellCandidates: [{ mark: "X", frames: 3, since: 0, lastSeen: 0 }, ...Array(8).fill(null)],
    });
    const next = updateCandidates({
      session: current,
      observation: observation(".........", 2000),
      visible: [false, ...Array(8).fill(true)],
      at: 2000,
      localReadings: true,
    });
    expect(next.cellCandidates[0]).toBeNull();
  });
});

describe("advanceRecognizedTurn", () => {
  it("confirms a recognized live X when the whole board matches", () => {
    const current = session({
      recognizedBoard: marks("....X...."),
      cellCandidates: stableCandidates("X").map((candidate, cell) => (cell === 4 ? candidate : Object.assign({}, candidate, { mark: null }))),
    });
    const next = advanceRecognizedTurn(current, observation("....X....", 1000));
    expect(next?.board[4]).toBe("X");
    expect(next?.phase).toBe("draw-ai");
  });

  it("does not advance replay or a misaligned frame", () => {
    expect(advanceRecognizedTurn(session({ mode: "replay", recognizedBoard: marks("....X....") }), observation("....X....", 10))).toBeNull();
    expect(advanceRecognizedTurn(session({ recognizedBoard: marks("....X....") }), observation("....X....", 10, { quality: "misaligned" }))).toBeNull();
  });

  it("confirms the pending O once it is recognized", () => {
    const current = resumeBoard(marks("X........"));
    current.recognizedBoard[current.pendingMove!] = "O";
    const seen = [...current.board];
    seen[current.pendingMove!] = "O";
    const next = advanceRecognizedTurn(
      {
        ...current,
        cellCandidates: seen.map((mark) => ({
          mark,
          frames: REQUIRED_STABLE_FRAMES,
          since: 0,
          lastSeen: 1000,
        })),
      },
      observation(seen.map((mark) => mark ?? ".").join(""), 1000),
    );
    expect(next?.board[current.pendingMove!]).toBe("O");
    expect(next?.phase).toBe("human");
  });
});
