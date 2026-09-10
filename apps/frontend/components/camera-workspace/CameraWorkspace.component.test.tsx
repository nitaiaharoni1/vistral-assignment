import { createRef } from "react";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { GameStore } from "../../stores/game/game.store";
import { GameStoreProvider } from "../../stores/game/helpers/game.helpers";
import { CameraWorkspace } from "./CameraWorkspace.component";
import { CameraStage } from "./subcomponents/camera-stage/CameraStage.component";
import { CameraFooter } from "./subcomponents/camera-footer/CameraFooter.component";

// Renders a child inside a game store provider.
function wrap(game: GameStore, child: ReactNode) {
  return render(<GameStoreProvider store={game}>{child}</GameStoreProvider>);
}

describe("CameraWorkspace", () => {
  it("names the workspace on the welcome screen", () => {
    wrap(new GameStore(), <CameraWorkspace onNewGame={() => {}} />);
    expect(screen.getByRole("region", { name: "Camera workspace" })).toBeInTheDocument();
  });
});

describe("CameraStage", () => {
  it("shows the welcome sculpture and the pause blocker", () => {
    const game = new GameStore();
    const resumeRef = createRef<HTMLButtonElement>();
    const pauseRef = createRef<HTMLButtonElement>();
    const { rerender } = wrap(game, <CameraStage resumeRef={resumeRef} pauseRef={pauseRef} onNewGame={vi.fn()} />);
    expect(screen.getByAltText(/Sculptural paper X and O/)).toBeInTheDocument();
    game.stage = "playing";
    game.play.session.paused = true;
    rerender(
      <GameStoreProvider store={game}>
        <CameraStage resumeRef={resumeRef} pauseRef={pauseRef} onNewGame={vi.fn()} />
      </GameStoreProvider>,
    );
    expect(screen.getByRole("group", { name: "Camera paused" })).toBeInTheDocument();
  });
});

describe("CameraFooter", () => {
  it("hides off the board and shows the legend in play", () => {
    const game = new GameStore();
    const { rerender } = wrap(game, <CameraFooter />);
    expect(screen.queryByLabelText("Board overlay legend")).toBeNull();
    game.stage = "playing";
    rerender(
      <GameStoreProvider store={game}>
        <CameraFooter />
      </GameStoreProvider>,
    );
    expect(screen.getByLabelText("Board overlay legend")).toHaveTextContent(/You/);
  });
});
