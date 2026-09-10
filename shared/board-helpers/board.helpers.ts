import type { Board } from "../types";
import type { Mark } from "../types";
import type { Outcome } from "../types";
import type { Session } from "../types";

type GameResult = { outcome: Outcome; winningLine: number[] | null };
type Legality = { valid: true; reason: null } | { valid: false; reason: string };

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
const MOVE_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];

// Counts how many X and O marks are on the board.
function markCounts(board: Board): { xs: number; os: number } {
  let xs = 0;
  let os = 0;
  for (const mark of board) {
    if (mark === "X") xs++;
    else if (mark === "O") os++;
  }
  return { xs, os };
}

// Picks the next phase from the current marks and outcome.
export function phaseForBoard(board: Board, outcome: Outcome): Session["phase"] {
  if (outcome) return "finished";
  const { xs, os } = markCounts(board);
  return xs === os ? "human" : "draw-ai";
}

// Lists squares that gained a mark since the last confirmed board.
export function addedCells(confirmed: Board, observed: Board): number[] {
  return observed.flatMap((mark, cell) => (mark !== null && confirmed[cell] === null ? [cell] : []));
}

// True when both boards have the same mark in every square.
export function sameBoard(left: Board, right: Board): boolean {
  return left.every((mark, cell) => mark === right[cell]);
}

// Returns the winner, draw, or an unfinished game.
export function getOutcome(board: Board): GameResult {
  if (board.length !== 9) return { outcome: null, winningLine: null };
  for (const line of LINES) {
    const mark = board[line[0]];
    if (mark && line.every((cell) => board[cell] === mark)) {
      return { outcome: mark, winningLine: [...line] };
    }
  }
  return {
    outcome: board.every((mark) => mark !== null) ? "draw" : null,
    winningLine: null,
  };
}

// Rejects boards that break tic-tac-toe turn or win rules.
export function checkLegality(board: Board): Legality {
  if (board.length !== 9 || board.some((mark) => mark !== null && mark !== "X" && mark !== "O")) {
    return {
      valid: false,
      reason: "A board must contain nine squares with only X, O, or empty space.",
    };
  }
  const { xs, os } = markCounts(board);
  if (xs !== os && xs !== os + 1) {
    return {
      valid: false,
      reason: "X starts, and each player adds one mark per turn.",
    };
  }
  const xWins = LINES.some((line) => line.every((cell) => board[cell] === "X"));
  const oWins = LINES.some((line) => line.every((cell) => board[cell] === "O"));
  if (xWins && oWins) return { valid: false, reason: "Both players cannot win the same game." };
  if (xWins && xs !== os + 1) {
    return { valid: false, reason: "No more marks can be added after X wins." };
  }
  if (oWins && xs !== os) {
    return { valid: false, reason: "No more marks can be added after O wins." };
  }
  return { valid: true, reason: null };
}

// Scores a position so O prefers wins and X prefers blocks.
function score(board: Board, turn: Exclude<Mark, null>, depth: number): number {
  const { outcome } = getOutcome(board);
  if (outcome === "O") return 10 - depth;
  if (outcome === "X") return depth - 10;
  if (outcome === "draw") return 0;

  let best = turn === "O" ? -Infinity : Infinity;
  for (const cell of MOVE_ORDER) {
    if (board[cell] !== null) continue;
    const next = [...board];
    next[cell] = turn;
    const value = score(next, turn === "O" ? "X" : "O", depth + 1);
    best = turn === "O" ? Math.max(best, value) : Math.min(best, value);
  }
  return best;
}

// Picks O's best legal square, or none if the game cannot move.
export function chooseMove(board: Board): number | null {
  if (!checkLegality(board).valid || getOutcome(board).outcome !== null) return null;
  const { xs, os } = markCounts(board);
  if (xs !== os + 1) return null;

  let bestMove: number | null = null;
  let bestScore = -Infinity;
  for (const cell of MOVE_ORDER) {
    if (board[cell] !== null) continue;
    const next = [...board];
    next[cell] = "O";
    const value = score(next, "X", 1);
    if (value > bestScore) {
      bestScore = value;
      bestMove = cell;
    }
  }
  return bestMove;
}
