import { act } from "@testing-library/react";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { AnalysisIndicator } from "./AnalysisIndicator.component";
import { useAnalysisBusy } from "./AnalysisIndicator.component";

// Exposes whether the delayed busy hook is visible.
function Probe({ active }: { active: boolean }) {
  const visible = useAnalysisBusy(active);
  return <div>{visible ? "on" : "off"}</div>;
}

describe("AnalysisIndicator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a board spinner and cell dots", () => {
    const { rerender, container } = render(<AnalysisIndicator kind="board" />);
    expect(container.querySelector("svg")).toBeTruthy();
    rerender(<AnalysisIndicator kind="cell" />);
    expect(container.querySelectorAll("span span")).toHaveLength(3);
  });

  it("waits before showing a busy mark", () => {
    vi.useFakeTimers();
    render(<Probe active />);
    expect(screen.getByText("off")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText("on")).toBeInTheDocument();
  });
});
