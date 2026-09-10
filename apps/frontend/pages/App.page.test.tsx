import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import App from "./App.page";

class FakeWorker extends EventTarget {
  // Drops incoming worker messages.
  postMessage() {}
  // Stops the fake worker.
  terminate() {}
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the skip link and the welcome play button", () => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      save() {},
      restore() {},
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      fillText() {},
      translate() {},
      rotate() {},
      ellipse() {},
    } as unknown as CanvasRenderingContext2D);
    const { unmount } = render(<App saveSessionFile={() => {}} />);
    expect(screen.getByRole("link", { name: /Skip to game/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Let's Play/ })).toBeInTheDocument();
    unmount();
  });
});
