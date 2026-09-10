import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { marks } from "../../../../../../tests/helpers/boards.ts";
import { observation } from "../../../../../../tests/helpers/boards.ts";
import { GameStore } from "../../../../stores/game/game.store";
import { GameStoreProvider } from "../../../../stores/game/helpers/game.helpers";
import { DetectionOverlay } from "./DetectionOverlay.component";

const CORNERS = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

// Renders DetectionOverlay inside a game store provider.
function renderOverlay(game: GameStore) {
  return render(
    <GameStoreProvider store={game}>
      <DetectionOverlay />
    </GameStoreProvider>,
  );
}

describe("DetectionOverlay", () => {
  it("hides until the board has four corners", () => {
    const { container } = renderOverlay(new GameStore());
    expect(container).toBeEmptyDOMElement();
  });

  it("draws confirmed, pending, and winning marks", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.cameraFeed.corners = CORNERS;
    game.cameraFeed.observation = observation("XXXOO....", 20);
    game.play.session = {
      ...game.play.session,
      board: marks("XXXOO...."),
      recognizedBoard: marks("XXXOO...."),
      phase: "finished",
      pageMatchesBoard: true,
      pendingMove: null,
    };
    renderOverlay(game);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringMatching(/wins/));
    expect(screen.getByRole("img").querySelectorAll("polygon").length).toBeGreaterThan(4);
    expect(screen.getByRole("img").querySelectorAll("line").length).toBeGreaterThan(4);
  });

  it("labels the next O to draw", () => {
    const game = new GameStore();
    game.stage = "playing";
    game.cameraFeed.corners = CORNERS;
    game.cameraFeed.observation = observation("X........", 20);
    game.play.session = {
      ...game.play.session,
      board: marks("X........"),
      recognizedBoard: marks("X........"),
      phase: "draw-ai",
      pendingMove: 4,
      pageMatchesBoard: true,
      paused: false,
    };
    renderOverlay(game);
    expect(screen.getByTitle("Draw next")).toHaveTextContent("Draw");
  });
});
