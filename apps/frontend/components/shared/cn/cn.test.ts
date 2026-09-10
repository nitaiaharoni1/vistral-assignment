import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names and drops the rest", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});
