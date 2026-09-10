import { describe, expect, it, vi } from "vitest";
import { boardInk, captureBoard, inkChanged } from "./board-snapshot";

describe("inkChanged", () => {
  it("ignores occupied saved cells", () => {
    expect(
      inkChanged(
        [0.2, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ["X", null, null, null, null, null, null, null, null],
      ),
    ).toBe(false);
  });

  it("notices a new dark patch in an empty cell", () => {
    expect(
      inkChanged([0.05, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ).toBe(true);
  });

  it("ignores tiny noise", () => {
    expect(
      inkChanged([0.004, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ).toBe(false);
  });
});

describe("boardInk", () => {
  it("stays near zero on a flat page and rises on a dark blob", () => {
    const size = 96;
    const gray = new Float32Array(size * size).fill(200);
    expect(Math.max(...boardInk(gray, size))).toBeLessThan(0.02);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) gray[y * size + x] = 20;
    }
    expect(boardInk(gray, size)[0]).toBeGreaterThan(0.05);
  });
});

describe("captureBoard", () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
  ];

  it("needs four corners and a readable canvas", () => {
    const canvas = document.createElement("canvas");
    expect(() => captureBoard(canvas, [])).toThrow(/whole board/);
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(() => captureBoard(canvas, corners)).toThrow(/unavailable/);
  });

  it("warps the frame into a jpeg snapshot", () => {
    const pixels = new Uint8ClampedArray(40 * 40 * 4).fill(220);
    const source = {
      width: 40,
      height: 40,
      getContext() {
        return {
          getImageData() {
            return { data: pixels, width: 40, height: 40 };
          },
        };
      },
    } as unknown as HTMLCanvasElement;
    const create = vi.spyOn(document, "createElement").mockImplementation(() => {
      const data = { data: new Uint8ClampedArray(384 * 384 * 4), width: 384, height: 384 };
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createImageData: () => data,
            putImageData() {},
          };
        },
        toDataURL: () => "data:image/jpeg;base64,/9j/SNAP",
      } as unknown as HTMLCanvasElement;
    });
    const snapshot = captureBoard(source, corners);
    create.mockRestore();
    expect(snapshot.image).toBe("data:image/jpeg;base64,/9j/SNAP");
    expect(snapshot.ink).toHaveLength(9);
  });
});
