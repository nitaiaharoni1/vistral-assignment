import { makeAutoObservable } from "mobx";
import type { GameStore } from "./game/game.store";

export type SaveSessionFile = (blob: Blob, filename: string) => void;

// Downloads a blob as a named file.
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export class AppStore {
  tutorialOpen = false;
  notice = "";
  resetOpen = false;

  // Wires the store to the game and file saver.
  constructor(
    private readonly game: GameStore,
    private readonly saveSessionFile: SaveSessionFile,
  ) {
    makeAutoObservable<AppStore, "game" | "saveSessionFile">(
      this,
      {
        game: false,
        saveSessionFile: false,
      },
      { autoBind: true },
    );
  }

  // Opens the tutorial overlay.
  openTutorial() {
    this.tutorialOpen = true;
  }

  // Closes the tutorial overlay.
  closeTutorial() {
    this.tutorialOpen = false;
  }

  // Closes the tutorial and starts the camera if idle.
  finishTutorial() {
    this.closeTutorial();
    if (this.game.stage === "idle") void this.game.startCamera();
  }

  // Clears the current notice.
  dismissNotice() {
    this.notice = "";
  }

  // Restarts a finished game or asks before resetting a live one.
  requestNewGame() {
    if (this.game.session.phase === "finished") {
      this.restart();
      return;
    }
    this.resetOpen = true;
  }

  // Closes the reset prompt without restarting.
  keepPlaying() {
    this.resetOpen = false;
  }

  // Starts a new game and clears notices.
  restart() {
    this.game.restartGame();
    this.resetOpen = false;
    this.notice = "";
  }

  // Saves a session log without video.
  exportSession() {
    const { session, source, observation } = this.game;
    const { boardCheck, ...savedSession } = session;
    const remote = this.game.usesRemoteAgent;
    const payload = {
      format: "paperplay-session-v1",
      exportedAt: new Date().toISOString(),
      source,
      versions: {
        perception: remote ? "openrouter-board-v1" : "classical-ink-v1",
        rules: "tic-tac-toe-v1",
        policy: "minimax-v1",
        app: "1.0.0",
      },
      assumptions: session.mode === "replay" ? { mode: "replay", intermediateMoveOrderMayBeUnknown: true } : { human: "X", agent: "O", suggestionsAreNotMoves: true },
      session: {
        ...savedSession,
        needsBoardCheck: boardCheck !== "ready",
        boardCheckReason: boardCheck === "ready" ? null : boardCheck === "interrupted" ? "interrupt" : "registration",
        registrationRecovered: boardCheck === "verifying-grid",
      },
      lastObservation: observation,
      observationHistory: this.game.getObservationHistory(),
      calibration: this.game.corners,
      captureFeedback: this.game.gameAgent.reply?.feedback ?? null,
      evidence: source === "sample" ? "Synthetic pixels. This is not a physical human game." : "Observations only. Review the separately recorded video for physical evidence.",
    };
    this.saveSessionFile(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `paperplay-${source}-session.json`,
    );
    this.notice = "Session log ready to save. It contains observations and decisions, not video.";
  }
}
