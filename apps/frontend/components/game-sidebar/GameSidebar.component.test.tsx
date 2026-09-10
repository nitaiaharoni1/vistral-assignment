import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { observation } from "../../../../tests/helpers/boards.ts";
import { GameStore } from "../../stores/game/game.store";
import { GameStoreProvider } from "../../stores/game/helpers/game.helpers";
import { GameSidebar } from "./GameSidebar.component";

// Renders GameSidebar inside a game store provider.
function renderSidebar(game: GameStore, onExport = vi.fn()) {
  return {
    onExport,
    ...render(
      <GameStoreProvider store={game}>
        <GameSidebar onExport={onExport} />
      </GameStoreProvider>,
    ),
  };
}

describe("GameSidebar", () => {
  it("exports an empty live session", async () => {
    const { onExport } = renderSidebar(new GameStore());
    expect(screen.getByText("Confirmed moves")).toBeInTheDocument();
    expect(screen.getByText("No confirmed moves yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save session log/ }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("lists a confirmed X and names Paperplay for O", () => {
    const game = new GameStore();
    game.play.session.board = ["X", "O", null, null, null, null, null, null, null];
    game.play.session.events = [
      {
        id: "event-1",
        at: 1,
        kind: "start",
        message: "start",
      },
      {
        id: "event-2",
        at: 2,
        kind: "human-move",
        mark: "X",
        cell: 0,
        message: "X in top left",
      },
      {
        id: "event-3",
        at: 3,
        kind: "ai-confirmed",
        mark: "O",
        cell: 1,
        message: "O in top center",
      },
    ];
    renderSidebar(game);
    expect(screen.getByText("2 moves")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Paperplay")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("uses replay copy and sample evidence", () => {
    const game = new GameStore();
    game.source = "sample";
    game.play.session.mode = "replay";
    game.play.session.events = [
      {
        id: "event-2",
        at: 2,
        kind: "observed-move",
        mark: "X",
        cell: 4,
        message: "X observed",
      },
    ];
    game.cameraFeed.observation = observation("....X....", 10);
    game.cameraFeed.readingRate = 8.2;
    renderSidebar(game);
    expect(screen.getByText("Confirmed observations")).toBeInTheDocument();
    expect(screen.getByText("X player")).toBeInTheDocument();
    expect(screen.getByText(/generated images/)).toBeInTheDocument();
    expect(screen.getByText(/8.2 board checks/)).toBeInTheDocument();
  });

  it("offers a correction once the camera agent has a reading", () => {
    const game = new GameStore();
    game.source = "camera";
    game.gameAgent.reply = {
      sessionId: "s",
      revision: 1,
      session: game.session,
      analysis: {
        cells: Array.from({ length: 9 }, () => ({
          mark: "empty" as const,
          confidence: 1,
        })),
        clear: true,
        reason: "ok",
      },
      status: "ready",
      message: "",
      model: "test",
      decisionSource: "rules",
      latencyMs: 12,
      costUsd: 0.01,
      learnedExamples: 1,
    };
    renderSidebar(game);
    expect(screen.getByRole("button", { name: "Correct a reading" })).toBeEnabled();
    expect(screen.getByText(/1 saved examples/)).toBeInTheDocument();
  });
});
