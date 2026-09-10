import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@shared/session.helpers";
import { marks } from "../../../../tests/helpers/boards.ts";
import { agentReply } from "../../../../tests/helpers/agent-fixtures.ts";
import { GameStore } from "../../stores/game/game.store";
import { GameStoreProvider } from "../../stores/game/helpers/game.helpers";
import { BoardCorrection } from "./BoardCorrection.component";

describe("BoardCorrection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the person relabel a snapshot and save it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => agentReply({ revision: 2 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const game = new GameStore();
    game.agent.reply = agentReply({
      revision: 1,
      session: createSession(),
      analysis: {
        cells: [
          { mark: "X", confidence: 1 },
          ...Array.from({ length: 8 }, () => ({
            mark: "empty" as const,
            confidence: 1,
          })),
        ],
        clear: true,
        reason: "User-corrected reading",
      },
    });
    game.agent.reviewImage = "data:image/jpeg;base64,/9j/SNAP";
    game.agent.correctionOpen = true;
    render(
      <GameStoreProvider store={game}>
        <BoardCorrection />
      </GameStoreProvider>,
    );
    expect(
      screen.getByRole("dialog", { name: "Correct the reading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /snapshot being corrected/ }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Mark in A1"), "O");
    await userEvent.click(
      screen.getByRole("button", { name: "Save correction" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).board).toEqual(
      marks("O........"),
    );
  });
});
