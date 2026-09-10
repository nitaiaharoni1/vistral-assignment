import { describe, expect, it } from "vitest";
import { classifyMark } from "./mark-classifier";

function empty(size = 40) {
  return new Uint8Array(size * size);
}

function filled(size = 40) {
  return new Uint8Array(size * size).fill(1);
}

function scribble(size = 40) {
  const mask = empty(size);
  for (let x = 6; x < 14; x++) mask[8 * size + x] = 1;
  for (let y = 20; y < 28; y++) mask[y * size + 22] = 1;
  return mask;
}

describe("classifyMark", () => {
  it("reads a clean empty cell with high confidence", () => {
    expect(classifyMark(empty(), 40)).toMatchObject({
      mark: null,
      confidence: 0.99,
    });
  });

  it("gives up when the cell is flooded with ink", () => {
    expect(classifyMark(filled(), 40).mark).toBe("?");
    expect(classifyMark(filled(), 40).confidence).toBe(0.05);
  });

  it("returns unknown for a mark that is not an X or O", () => {
    const reading = classifyMark(scribble(), 40);
    expect(reading.mark).toBe("?");
    expect(reading.ink).toBeGreaterThan(0);
  });

  it("keeps a strong unknown when the faint layer is a different shape", () => {
    const strong = scribble();
    const weak = filled();
    const reading = classifyMark(strong, 40, weak);
    expect(reading.mark).toBe("?");
  });
});
