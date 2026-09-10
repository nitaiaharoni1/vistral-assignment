import { makeAutoObservable } from "mobx";
import type { Board } from "../../types";
import type { Observation } from "../../types";
import type { Session } from "../../types";
import { createSession } from "@shared/session-helpers/session.helpers";
import { pauseSession } from "@shared/session-helpers/session.helpers";
import { resumeSession } from "@shared/session-helpers/session.helpers";
import { resetStability } from "@shared/session-helpers/session.helpers";
import { withUnverifiedPage } from "@shared/session-helpers/session.helpers";
import { resumeBoard } from "@shared/accept-session/accept-session";
import { observe } from "./helpers/observation.helpers";

export class SessionStore {
  session: Session = createSession();

  // Makes the session store observable.
  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Starts a fresh session.
  reset(mode: Session["mode"] = "play") {
    this.session = createSession(mode);
  }

  // Pauses the session.
  pause() {
    this.session = pauseSession(this.session);
  }

  // Resumes the session.
  resume() {
    this.session = resumeSession(this.session);
  }

  // Applies a new observation to the session.
  observe(observation: Observation) {
    this.session = observe(this.session, observation);
    return this.session;
  }

  // Imports a board or re-verifies a known one.
  resumeFromBoard(board: Board, mode: Session["mode"]) {
    const previous = this.session;
    if (previous.mode === mode && (previous.board.some(Boolean) || previous.recognizedBoard.some(Boolean))) {
      this.session = {
        ...resetStability(withUnverifiedPage(previous)),
        paused: false,
        boardCheck: "verifying-grid",
        message: "Grid found again. Your detected marks and next move are saved.",
      };
      return;
    }
    this.session = resumeBoard(board, mode);
  }
}
