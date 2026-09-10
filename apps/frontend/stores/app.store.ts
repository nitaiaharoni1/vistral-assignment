import { makeAutoObservable, reaction } from "mobx";
import type { GameStore } from "./game/game.store";
import { actionCopy } from "../components/next-action/NextAction.component";

export type SaveSessionFile = (blob: Blob, filename: string) => void;

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

const VOICE_KEY = "paperplay-voice";

function savedVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function speak(text: string) {
  if (typeof speechSynthesis === "undefined" || !text) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export class AppStore {
  tutorialOpen = false;
  notice = "";
  resetOpen = false;
  voiceOn = savedVoice();

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

  startVoice(): () => void {
    return reaction(
      () => this.spokenInstruction,
      (text) => speak(text),
    );
  }

  get spokenInstruction(): string {
    if (!this.voiceOn || !this.game.inGame) return "";
    const { title, guidance } = actionCopy(this.game);
    if (title.endsWith("…")) return "";
    return `${title} ${guidance}`;
  }

  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    if (!this.voiceOn && typeof speechSynthesis !== "undefined")
      speechSynthesis.cancel();
    try {
      localStorage.setItem(VOICE_KEY, this.voiceOn ? "on" : "off");
    } catch {}
  }

  openTutorial() {
    this.tutorialOpen = true;
  }

  closeTutorial() {
    this.tutorialOpen = false;
  }

  finishTutorial() {
    this.closeTutorial();
    if (this.game.stage === "idle") void this.game.startCamera();
  }

  dismissNotice() {
    this.notice = "";
  }

  requestNewGame() {
    if (this.game.session.phase === "finished") {
      this.restart();
      return;
    }
    this.resetOpen = true;
  }

  keepPlaying() {
    this.resetOpen = false;
  }

  restart() {
    this.game.restartGame();
    this.resetOpen = false;
    this.notice = "";
  }

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
      assumptions:
        session.mode === "replay"
          ? { mode: "replay", intermediateMoveOrderMayBeUnknown: true }
          : { human: "X", agent: "O", suggestionsAreNotMoves: true },
      session: {
        ...savedSession,
        needsBoardCheck: boardCheck !== "ready",
        boardCheckReason:
          boardCheck === "ready"
            ? null
            : boardCheck === "interrupted"
              ? "interrupt"
              : "registration",
        registrationRecovered: boardCheck === "verifying-grid",
      },
      lastObservation: observation,
      observationHistory: this.game.getObservationHistory(),
      calibration: this.game.corners,
      captureFeedback: this.game.agent.reply?.feedback ?? null,
      evidence:
        source === "sample"
          ? "Synthetic pixels. This is not a physical human game."
          : "Observations only. Review the separately recorded video for physical evidence.",
    };
    this.saveSessionFile(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `paperplay-${source}-session.json`,
    );
    this.notice =
      "Session log ready to save. It contains observations and decisions, not video.";
  }
}
