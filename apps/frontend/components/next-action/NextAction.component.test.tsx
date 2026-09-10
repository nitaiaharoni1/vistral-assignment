import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { marks } from "../../../../tests/helpers/boards.ts";
import { GameStore } from "../../stores/game/game.store";
import { GameStoreProvider } from "../../stores/game/helpers/game.helpers";
import { NextAction } from "./NextAction.component";

// Renders NextAction inside a game store provider.
function renderAction(game: GameStore, onNewGame = vi.fn()) {
  return {
    onNewGame,
    ...render(
      <GameStoreProvider store={game}>
        <NextAction onNewGame={onNewGame} />
      </GameStoreProvider>,
    ),
  };
}

describe("NextAction", () => {
  it("asks for the first X", () => {
    renderAction(new GameStore());
    expect(screen.getByRole("heading", { name: "Your turn. Draw X." })).toBeInTheDocument();
    expect(screen.getByText("Choose an empty square.")).toBeInTheDocument();
  });

  it("offers Play again after a finished live game", async () => {
    const game = new GameStore();
    game.stage = "playing";
    game.play.session.phase = "finished";
    game.play.session.board = marks("XXXOO....");
    const { onNewGame } = renderAction(game);
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(onNewGame).toHaveBeenCalledOnce();
  });

  it("shows connecting copy while the camera agent has no reading yet", () => {
    const game = new GameStore();
    game.source = "camera";
    game.stage = "playing";
    game.preparingBoard = true;
    renderAction(game);
    expect(screen.getByRole("heading", { name: "Draw a 3×3 grid." })).toBeInTheDocument();
  });
});
