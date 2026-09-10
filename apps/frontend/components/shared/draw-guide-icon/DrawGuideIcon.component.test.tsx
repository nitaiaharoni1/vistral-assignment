import { render } from "@testing-library/react";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { DrawGuideIcon } from "./DrawGuideIcon.component";

describe("DrawGuideIcon", () => {
  it("draws the guide ring", () => {
    const { container } = render(<DrawGuideIcon />);
    expect(container.querySelector("path")).toBeTruthy();
  });
});
