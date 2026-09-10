import type { BoardAnalysis } from "../../../../shared/game-agent-protocol/game-agent-protocol";

// True when one cell has a mark and a 0-1 confidence score.
function isAnalysisCell(cell: unknown): boolean {
  return (
    !!cell &&
    typeof cell === "object" &&
    Object.keys(cell).toSorted().join() === "confidence,mark" &&
    ["X", "O", "empty", "unknown"].includes((cell as { mark: string }).mark) &&
    Number.isFinite((cell as { confidence: number }).confidence) &&
    (cell as { confidence: number }).confidence >= 0 &&
    (cell as { confidence: number }).confidence <= 1
  );
}

// True when the object has nine cells plus clear and reason.
function isAnalysisShape(item: Record<string, unknown>): boolean {
  return (
    Object.keys(item).toSorted().join() === "cells,clear,reason" &&
    typeof item.clear === "boolean" &&
    typeof item.reason === "string" &&
    item.reason.length <= 240 &&
    Array.isArray(item.cells) &&
    item.cells.length === 9 &&
    item.cells.every(isAnalysisCell)
  );
}

// Turns model JSON into a board analysis, or throws.
export function parseAnalysis(value: unknown): BoardAnalysis {
  if (!value || typeof value !== "object") throw new Error("Invalid model response");
  const item = value as Record<string, unknown>;
  if (!isAnalysisShape(item)) throw new Error("Invalid model response");
  return item as BoardAnalysis;
}
