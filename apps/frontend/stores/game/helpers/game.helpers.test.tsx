import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { GameStore } from "../game.store";
import { GameStoreProvider } from "./game.helpers";
import { useCreateGameStore } from "./game.helpers";
import { useGameStore } from "./game.helpers";

// Renders the current game stage from context.
function Probe() {
  const game = useGameStore();
  return <div>{game.stage}</div>;
}

// Creates a store and renders its stage.
function Created() {
  const game = useCreateGameStore();
  return <div>{game.stage}</div>;
}

describe("GameStoreProvider", () => {
  it("provides the store to children", () => {
    render(
      <GameStoreProvider store={new GameStore()}>
        <Probe />
      </GameStoreProvider>,
    );
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("throws when the store is missing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/Game store is missing/);
    error.mockRestore();
  });
});

describe("useCreateGameStore", () => {
  it("starts a store for the page and stops it on unmount", () => {
    const { unmount } = render(<Created />);
    expect(screen.getByText("idle")).toBeInTheDocument();
    unmount();
  });
});
