import { describe, expect, it } from "vitest";
import { withinWindow } from "./rate-limit";

describe("withinWindow", () => {
  it("drops stamps that have left the window and then allows a new one", () => {
    const stamps = [100, 200, 300];
    expect(withinWindow(stamps, 1000, 500, 3)).toBe(true);
    expect(stamps).toEqual([]);
  });

  it("refuses a stamp once the window is full", () => {
    const stamps = [900, 950, 980];
    expect(withinWindow(stamps, 1000, 500, 3)).toBe(false);
    expect(stamps).toEqual([900, 950, 980]);
  });

  it("keeps recent stamps and removes only the old ones", () => {
    const stamps = [100, 800, 900];
    expect(withinWindow(stamps, 1000, 500, 3)).toBe(true);
    expect(stamps).toEqual([800, 900]);
  });
});
