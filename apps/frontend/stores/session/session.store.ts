import { makeAutoObservable } from "mobx";
import type { Board, Observation, Session } from "../../types";
import {
  createSession,
  pauseSession,
  resumeSession,
  resetStability,
  withUnverifiedPage,
} from "@shared/session.helpers";
import { resumeBoard } from "@shared/accept-session";
import { observe } from "./helpers/observation.helpers";

export class SessionStore {
  session: Session = createSession();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset(mode: Session["mode"] = "play") {
    this.session = createSession(mode);
  }

  pause() {
    this.session = pauseSession(this.session);
  }

  resume() {
    this.session = resumeSession(this.session);
  }

  observe(observation: Observation) {
    this.session = observe(this.session, observation);
    return this.session;
  }

  resumeFromBoard(board: Board, mode: Session["mode"]) {
    const previous = this.session;
    if (
      previous.mode === mode &&
      (previous.board.some(Boolean) || previous.recognizedBoard.some(Boolean))
    ) {
      this.session = {
        ...resetStability(withUnverifiedPage(previous)),
        paused: false,
        boardCheck: "verifying-grid",
        message:
          "Grid found again. Your detected marks and next move are saved.",
      };
      return;
    }
    this.session = resumeBoard(board, mode);
  }
}
