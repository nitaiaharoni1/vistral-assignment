import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameStore } from "../game.store";
import { GameStoreProvider, useGameStore } from "./game.helpers";

function Probe() {
  const game = useGameStore();
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
