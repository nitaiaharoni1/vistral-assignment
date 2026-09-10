import { makeAutoObservable, runInAction } from "mobx";
import type { Board, Observation } from "../../types";
import {
  DEFAULT_CAPTURE_STABLE_MS,
  type AgentReply,
} from "@shared/agent-protocol";
import type { GameStore } from "../game/game.store";
import { captureBoard, inkChanged, type BoardSnapshot } from "./board-snapshot";

function profileId(): string {
  try {
    const saved = localStorage.getItem("paperplay-profile");
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem("paperplay-profile", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
async function post(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<AgentReply> {
  const response = await fetch(`/api/agent/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Could not check the board. Try again.");
  return result as AgentReply;
}

export class AgentStore {
  reply: AgentReply | null = null;
  busy = false;
  message = "";
  correctionOpen = false;
  reviewImage: string | null = null;
  private epoch = 0;
  private controller: AbortController | null = null;
  private lastSampleAt = 0;
  private nextRequestAt = 0;
  private stableSince = 0;
  private previous: BoardSnapshot | null = null;
  private checked: number[][] = [];
  private lastClearAt = 0;
  private stableFrames = 0;

  constructor(private readonly game: GameStore) {
    makeAutoObservable<
      AgentStore,
      "game" | "controller" | "previous" | "checked"
    >(
      this,
      { game: false, controller: false, previous: false, checked: false },
      { autoBind: true },
    );
  }
  get enabled() {
    return this.game.source === "camera";
  }
  get canCheck() {
    return (
      this.enabled &&
      this.game.inGame &&
      !this.game.blocked &&
      !this.busy &&
      this.game.corners.length === 4 &&
      this.game.session.phase !== "finished"
    );
  }
  reset() {
    this.epoch++;
    this.controller?.abort();
    this.reply = null;
    this.busy = false;
    this.message = "";
    this.previous = null;
    this.checked = [];
    this.stableSince = 0;
    this.nextRequestAt = 0;
    this.lastClearAt = 0;
    this.stableFrames = 0;
    this.correctionOpen = false;
    this.reviewImage = null;
  }
  async connect() {
    if (!this.enabled || this.reply || this.busy) return;
    const epoch = this.epoch;
    this.busy = true;
    try {
      const reply = await post("sessions", {
        profile: profileId(),
      });
      if (epoch === this.epoch) runInAction(() => this.apply(reply));
    } catch (error) {
      if (epoch === this.epoch)
        runInAction(() => {
          this.message =
            error instanceof Error
              ? error.message
              : "Could not connect to the board reader.";
        });
    } finally {
      if (epoch === this.epoch)
        runInAction(() => {
          this.busy = false;
        });
    }
  }
  private observationBlocked() {
    return (
      !this.enabled ||
      !this.reply ||
      this.correctionOpen ||
      this.game.blocked ||
      document.hidden ||
      this.game.session.phase === "finished"
    );
  }
  private stableSnapshot(
    observation: Observation,
    now: number,
  ): BoardSnapshot | null {
    if (observation.quality !== "good" || now - this.lastClearAt > 1500) {
      this.stableSince = 0;
      this.stableFrames = 0;
      this.previous = null;
    }
    if (observation.quality !== "good" || !this.game.cameraFeed.canvas)
      return null;
    const snapshot = captureBoard(
      this.game.cameraFeed.canvas,
      this.game.corners,
    );
    this.lastClearAt = now;
    if (!this.previous || inkChanged(snapshot.ink, this.previous.ink)) {
      this.stableSince = now;
      this.stableFrames = 0;
      this.previous = snapshot;
    }
    this.stableFrames++;
    const stableMs =
      this.reply?.feedback?.stableMs ?? DEFAULT_CAPTURE_STABLE_MS;
    return this.stableFrames >= 3 && now - this.stableSince >= stableMs
      ? snapshot
      : null;
  }
  observe(observation: Observation) {
    if (this.observationBlocked()) return;
    const now = performance.now();
    if (now - this.lastSampleAt < 120) return;
    this.lastSampleAt = now;
    const snapshot = this.stableSnapshot(observation, now);
    if (!snapshot || this.busy || now < this.nextRequestAt) return;
    const changed = this.checked.every((ink) =>
      inkChanged(snapshot.ink, ink, this.game.session.board),
    );
    if (changed) void this.check(snapshot);
  }
  async checkNow() {
    if (!this.canCheck) return;
    if (!this.reply) await this.connect();
    if (!this.reply || !this.game.cameraFeed.canvas || this.game.blocked)
      return;
    if (!this.game.cameraFeed.hasReadyFrame()) {
      this.message =
        "Hold the whole board still and move your hand away, then try again.";
      return;
    }
    await this.check(
      captureBoard(this.game.cameraFeed.canvas, this.game.corners),
      "manual",
    );
  }
  private async check(
    snapshot: BoardSnapshot,
    trigger: "automatic" | "manual" = "automatic",
  ) {
    if (!this.reply || this.busy) return;
    const epoch = this.epoch;
    let requestFailed = false;
    const requestStartedAt = performance.now();
    this.controller = new AbortController();
    this.busy = true;
    this.message = "";
    this.checked = [...this.checked, snapshot.ink].slice(-4);
    this.reviewImage = snapshot.image;
    try {
      const reply = await post(
        "analyze",
        {
          sessionId: this.reply.sessionId,
          revision: this.reply.revision,
          requestId: crypto.randomUUID(),
          image: snapshot.image,
          trigger,
        },
        AbortSignal.any([this.controller.signal, AbortSignal.timeout(25000)]),
      );
      if (epoch !== this.epoch) return;
      runInAction(() => {
        this.apply(reply);
      });
    } catch (error) {
      requestFailed = true;
      if (epoch !== this.epoch) return;
      runInAction(() => {
        this.message =
          error instanceof Error
            ? error.message
            : "Could not check the board. Try again.";
      });
      try {
        const recovered = await post("sync", {
          sessionId: this.reply!.sessionId,
          revision: this.reply!.revision,
        });
        if (epoch === this.epoch && recovered.revision > this.reply!.revision)
          runInAction(() => this.apply(recovered));
      } catch {}
    } finally {
      if (epoch === this.epoch)
        runInAction(() => {
          this.busy = false;
          this.nextRequestAt = requestFailed
            ? performance.now() + 15000
            : Math.max(requestStartedAt + 2000, performance.now() + 400);
        });
    }
  }
  private apply(reply: AgentReply) {
    this.reply = reply;
    this.game.preparingBoard = false;
    this.game.play.session = {
      ...reply.session,
      paused: this.game.session.paused,
    };
    this.message =
      reply.status === "ready" ? (reply.notice ?? "") : reply.message;
  }
  openCorrection() {
    if (this.reply?.analysis && !this.busy) this.correctionOpen = true;
  }
  closeCorrection() {
    this.correctionOpen = false;
  }
  async correct(board: Board) {
    if (!this.reply || this.busy) return;
    const epoch = this.epoch;
    this.busy = true;
    try {
      const reply = await post("feedback", {
        sessionId: this.reply.sessionId,
        revision: this.reply.revision,
        board,
      });
      if (epoch === this.epoch)
        runInAction(() => {
          this.apply(reply);
          this.correctionOpen = false;
        });
    } catch (error) {
      if (epoch === this.epoch)
        runInAction(() => {
          this.message =
            error instanceof Error
              ? error.message
              : "Could not save the correction.";
        });
    } finally {
      if (epoch === this.epoch)
        runInAction(() => {
          this.busy = false;
        });
    }
  }
}
