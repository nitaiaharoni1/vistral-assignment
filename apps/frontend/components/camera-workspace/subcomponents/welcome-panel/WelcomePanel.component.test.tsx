import { createRef } from "react";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GameStore } from "../../../../stores/game/game.store";
import { GameStoreProvider } from "../../../../stores/game/helpers/game.helpers";
import { WelcomePanel } from "./WelcomePanel.component";

// Renders WelcomePanel inside a game store provider.
function renderWelcome(game: GameStore) {
  return render(
    <GameStoreProvider store={game}>
      <WelcomePanel fileRef={createRef<HTMLInputElement>()} />
    </GameStoreProvider>,
  );
}

describe("WelcomePanel", () => {
  it("asks to play on the idle screen", () => {
    renderWelcome(new GameStore());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Your pen/);
    expect(screen.getByRole("button", { name: /Let's Play/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See it play" })).toBeEnabled();
  });

  it("explains camera, video, and sample startup", () => {
    const game = new GameStore();
    game.stage = "starting";
    game.source = "camera";
    const { rerender } = renderWelcome(game);
    expect(screen.getByText(/Getting ready/)).toBeInTheDocument();
    expect(screen.getByText(/Allow camera access/)).toBeInTheDocument();
    game.source = "video";
    rerender(
      <GameStoreProvider store={game}>
        <WelcomePanel fileRef={createRef<HTMLInputElement>()} />
      </GameStoreProvider>,
    );
    expect(screen.getByText(/first frame of your recording/)).toBeInTheDocument();
    game.source = "sample";
    rerender(
      <GameStoreProvider store={game}>
        <WelcomePanel fileRef={createRef<HTMLInputElement>()} />
      </GameStoreProvider>,
    );
    expect(screen.getByText(/sample game/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("shows a startup error", () => {
    const game = new GameStore();
    game.error = "Camera permission was declined.";
    renderWelcome(game);
    expect(screen.getByRole("alert")).toHaveTextContent("Camera permission was declined.");
  });

  it("goes back from startup", async () => {
    const game = new GameStore();
    game.stage = "starting";
    game.source = "camera";
    renderWelcome(game);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(game.stage).toBe("idle");
    expect(game.source).toBe("none");
  });
});
