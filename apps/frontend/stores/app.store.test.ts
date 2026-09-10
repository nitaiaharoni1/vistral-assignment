import { describe, expect, it, vi } from "vitest";
import { marks } from "../../../tests/helpers/boards.ts";
import { GameStore } from "./game/game.store";
import { AppStore } from "./app.store";

describe("AppStore", () => {
  it("opens and finishes the tutorial without starting a camera mid-game", () => {
    const game = new GameStore();
    game.stage = "playing";
    const app = new AppStore(game, vi.fn());
    app.openTutorial();
    expect(app.tutorialOpen).toBe(true);
    app.finishTutorial();
    expect(app.tutorialOpen).toBe(false);
    expect(game.stage).toBe("playing");
  });

  it("asks before resetting a live game, and restarts a finished one", () => {
    const game = new GameStore();
    const app = new AppStore(game, vi.fn());
    app.requestNewGame();
    expect(app.resetOpen).toBe(true);
    app.keepPlaying();
    expect(app.resetOpen).toBe(false);
    game.play.session.phase = "finished";
    app.requestNewGame();
    expect(app.resetOpen).toBe(false);
  });

  it("exports a session log without the raw boardCheck field", async () => {
    const game = new GameStore();
    game.source = "sample";
    game.play.session.board = marks("X........");
    const save = vi.fn();
    const app = new AppStore(game, save);
    app.exportSession();
    expect(save).toHaveBeenCalledOnce();
    const [blob, name] = save.mock.calls[0];
    expect(name).toBe("paperplay-sample-session.json");
    expect(blob).toBeInstanceOf(Blob);
    const payload = JSON.parse(await (blob as Blob).text()) as {
      format: string;
      source: string;
      versions: { perception: string; policy: string };
      assumptions: { human?: string };
      session: { boardCheck?: unknown; needsBoardCheck: boolean };
      evidence: string;
    };
    expect(payload.format).toBe("paperplay-session-v1");
    expect(payload.source).toBe("sample");
    expect(payload.versions.perception).toBe("classical-ink-v1");
    expect(payload.versions.policy).toBe("minimax-v1");
    expect(payload.assumptions.human).toBe("X");
    expect(payload.session.boardCheck).toBeUndefined();
    expect(payload.session.needsBoardCheck).toBe(false);
    expect(payload.evidence).toMatch(/Synthetic pixels/);
    expect(app.notice).toMatch(/Session log ready/);
    app.dismissNotice();
    expect(app.notice).toBe("");
  });

  it("tags a camera export as the remote reader", async () => {
    const game = new GameStore();
    game.source = "camera";
    game.play.session.mode = "replay";
    const save = vi.fn();
    new AppStore(game, save).exportSession();
    const payload = JSON.parse(
      await (save.mock.calls[0][0] as Blob).text(),
    ) as {
      versions: { perception: string; policy: string };
      assumptions: { mode?: string };
    };
    expect(payload.versions.perception).toBe("openrouter-board-v1");
    expect(payload.versions.policy).toBe("minimax-v1");
    expect(payload.assumptions.mode).toBe("replay");
  });
});
