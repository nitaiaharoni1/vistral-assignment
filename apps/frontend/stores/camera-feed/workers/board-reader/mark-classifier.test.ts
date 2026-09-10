import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { classifyMark } from "./mark-classifier";

// Builds an empty ink mask.
function empty(size = 40) {
  return new Uint8Array(size * size);
}

// Builds a fully inked mask.
function filled(size = 40) {
  return new Uint8Array(size * size).fill(1);
}

// Builds a scribble that is not an X or O.
function scribble(size = 40) {
  const mask = empty(size);
  for (let x = 6; x < 14; x++) mask[8 * size + x] = 1;
  for (let y = 20; y < 28; y++) mask[y * size + 22] = 1;
  return mask;
}

describe("classifyMark", () => {
  it("reads a clean empty cell with high confidence", () => {
    expect(classifyMark({ mask: empty(), size: 40 })).toMatchObject({
      mark: null,
      confidence: 0.99,
    });
  });

  it("gives up when the cell is flooded with ink", () => {
    expect(classifyMark({ mask: filled(), size: 40 }).mark).toBe("?");
    expect(classifyMark({ mask: filled(), size: 40 }).confidence).toBe(0.05);
  });

  it("returns unknown for a mark that is not an X or O", () => {
    const reading = classifyMark({ mask: scribble(), size: 40 });
    expect(reading.mark).toBe("?");
    expect(reading.ink).toBeGreaterThan(0);
  });

  it("keeps a strong unknown when the faint layer is a different shape", () => {
    const strong = scribble();
    const weak = filled();
    const reading = classifyMark({ mask: strong, size: 40, weakMask: weak });
    expect(reading.mark).toBe("?");
  });

  it("treats a few specks as empty", () => {
    const mask = empty(40);
    mask[20 * 40 + 20] = 1;
    expect(classifyMark({ mask, size: 40 }).mark).toBeNull();
  });

  it("reads a thick handwritten X", () => {
    const size = 48;
    const mask = empty(size);
    for (let i = 8; i < size - 8; i++) {
      for (let t = -2; t <= 2; t++) {
        set({ mask, size, x: i + t, y: i });
        set({ mask, size, x: size - 1 - i + t, y: i });
      }
    }
    expect(classifyMark({ mask, size }).mark).toBe("X");
  });

  it("reads a closed O", () => {
    const size = 48;
    const mask = empty(size);
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot(x - cx, y - cy);
        if (radius > 12 && radius < 18) mask[y * size + x] = 1;
      }
    }
    expect(classifyMark({ mask, size }).mark).toBe("O");
  });

  it("drops ink outside the cell core", () => {
    const size = 40;
    const mask = empty(size);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) mask[y * size + x] = 1;
    }
    const reading = classifyMark({
      mask,
      size,
      bounds: { minX: 12, minY: 12, maxX: 28, maxY: 28 },
    });
    expect(reading.mark).toBeNull();
  });
});

// Sets one in-bounds mask pixel.
function set(input: { mask: Uint8Array; size: number; x: number; y: number }) {
  if (input.x >= 0 && input.y >= 0 && input.x < input.size && input.y < input.size) input.mask[input.y * input.size + input.x] = 1;
}
