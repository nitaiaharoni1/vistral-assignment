import { createSession } from "../../shared/session.helpers";
import type { Board, Observation, Session } from "../../shared/types";
import type { BoardAnalysis, VisibleMark } from "../../shared/agent-protocol";

export function marks(key: string): Board {
  return [...key].map((cell) => {
    if (cell === "." || cell === "_") return null;
    if (cell === "X" || cell === "O") return cell;
    throw new Error(`Invalid board key character: ${cell}`);
  });
}

export function keyOf(board: Board): string {
  return board.map((cell) => cell ?? ".").join("");
}

export function session(overrides: Partial<Session> = {}): Session {
  return { ...createSession(), ...overrides };
}

export function times(start: number, end: number, step = 100): number[] {
  return Array.from(
    { length: Math.floor((end - start) / step) + 1 },
    (_, index) => start + index * step,
  );
}

export function observation(
  key: string,
  timestamp: number,
  hidden: number[] = [],
  extra: Partial<Observation> = {},
): Observation {
  const board = marks(key);
  return {
    timestamp,
    processingMs: 1,
    motion: 0,
    quality: "good",
    message: "test observation",
    cells: board.map((mark, cell) => ({
      mark: hidden.includes(cell) ? "?" : mark,
      confidence: hidden.includes(cell) ? 0 : 0.99,
      readable: !hidden.includes(cell),
      ink: mark ? 0.08 : 0,
    })),
    ...extra,
  };
}

function analysisMark(cell: string): VisibleMark {
  if (cell === ".") return "empty";
  if (cell === "?") return "unknown";
  if (cell === "X" || cell === "O") return cell;
  throw new Error(`Invalid analysis key character: ${cell}`);
}

export function analysis(
  key: string,
  extra: Partial<BoardAnalysis> = {},
): BoardAnalysis {
  return {
    cells: [...key].map((cell) => ({
      mark: analysisMark(cell),
      confidence: 0.95,
    })),
    clear: true,
    reason: "test",
    ...extra,
  };
}
