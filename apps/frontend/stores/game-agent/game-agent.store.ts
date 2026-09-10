import { makeAutoObservable } from "mobx";
import { runInAction } from "mobx";
import type { Board } from "../../types";
import type { Observation } from "../../types";
import { DEFAULT_CAPTURE_STABLE_MS } from "@shared/game-agent-protocol/game-agent-protocol";
import { GAME_AGENT_API_BASE } from "@shared/game-agent-protocol/game-agent-protocol";
import { isGameAgentErrorReply } from "@shared/game-agent-protocol/game-agent-protocol";
import { isGameAgentReply } from "@shared/game-agent-protocol/game-agent-protocol";
import { isUuid } from "@shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentReply } from "@shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentRoutes } from "@shared/game-agent-protocol/game-agent-protocol";
import type { AnalyzeTrigger } from "@shared/game-agent-protocol/game-agent-protocol";
import { captureBoard } from "./board-snapshot";
import { inkChanged } from "./board-snapshot";
import type { BoardSnapshot } from "./board-snapshot";

type GameAgentHost = {
  source: string;
  readonly inGame: boolean;
  readonly blocked: boolean;
  readonly corners: Parameters<typeof captureBoard>[1];
  readonly session: GameAgentReply["session"];
  preparingBoard: boolean;
  play: { session: GameAgentReply["session"] };
  cameraFeed: {
    canvas: HTMLCanvasElement | null;
    hasReadyFrame(): boolean;
  };
};

// Loads or creates a saved player id.
function profileId(): string {
  try {
    const saved = localStorage.getItem("paperplay-profile");
    if (isUuid(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem("paperplay-profile", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
// Posts JSON to the agent API.
async function post<P extends keyof GameAgentRoutes>(path: P, body: GameAgentRoutes[P]["request"], signal?: AbortSignal): Promise<GameAgentRoutes[P]["response"]> {
  const response = await fetch(`${GAME_AGENT_API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(isGameAgentErrorReply(result) ? result.error : "Could not check the board. Try again.");
  if (!isGameAgentReply(result)) throw new Error("Could not check the board. Try again.");
  return result;
}

export class GameAgentStore {
  reply: GameAgentReply | null = null;
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

  // Wires the store to the game.
  constructor(private readonly game: GameAgentHost) {
    makeAutoObservable<GameAgentStore, "game" | "controller" | "previous" | "checked">(this, { game: false, controller: false, previous: false, checked: false }, { autoBind: true });
  }
  // True when the camera agent is in use.
  get enabled() {
    return this.game.source === "camera";
  }
  // True when a live camera board can be checked.
  get canCheck() {
    return this.enabled && this.game.inGame && !this.game.blocked && !this.busy && this.game.corners.length === 4 && this.game.session.phase !== "finished";
  }
  // Clears the session and any in-flight check.
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
  // Opens a remote agent session.
  async connect() {
    if (!this.enabled || this.reply || this.busy) return;
    const epoch = this.epoch;
    const controller = this.beginRequest();
    this.busy = true;
    try {
      const reply = await post(
        "sessions",
        {
          profile: profileId(),
        },
        controller.signal,
      );
      if (epoch === this.epoch) runInAction(() => this.apply(reply));
    } catch (error) {
      if (epoch === this.epoch)
        runInAction(() => {
          this.message = error instanceof Error ? error.message : "Could not connect to the board reader.";
        });
    } finally {
      if (this.controller === controller) this.controller = null;
      if (epoch === this.epoch)
        runInAction(() => {
          this.busy = false;
        });
    }
  }
  // True when automatic checks should not run.
  private observationBlocked() {
    return !this.enabled || !this.reply || this.correctionOpen || this.game.blocked || document.hidden || this.game.session.phase === "finished";
  }
  // Drops settle tracking when the view is unclear or went stale.
  private resetIfUnclear(observation: Observation, now: number) {
    if (observation.quality !== "good" || now - this.lastClearAt > 1500) {
      this.stableSince = 0;
      this.stableFrames = 0;
      this.previous = null;
    }
  }
  // Restarts the settle clock when ink changes.
  private trackInkStability(snapshot: BoardSnapshot, now: number) {
    if (!this.previous || inkChanged(snapshot.ink, this.previous.ink)) {
      this.stableSince = now;
      this.stableFrames = 0;
      this.previous = snapshot;
    }
    this.stableFrames++;
  }
  // Returns the snapshot once enough still frames have passed.
  private settledSnapshot(snapshot: BoardSnapshot, now: number): BoardSnapshot | null {
    const stableMs = this.reply?.feedback?.stableMs ?? DEFAULT_CAPTURE_STABLE_MS;
    return this.stableFrames >= 3 && now - this.stableSince >= stableMs ? snapshot : null;
  }
  // Returns a still board snapshot once ink has settled.
  private stableSnapshot(observation: Observation, now: number): BoardSnapshot | null {
    this.resetIfUnclear(observation, now);
    if (observation.quality !== "good" || !this.game.cameraFeed.canvas) return null;
    const snapshot = captureBoard(this.game.cameraFeed.canvas, this.game.corners);
    this.lastClearAt = now;
    this.trackInkStability(snapshot, now);
    return this.settledSnapshot(snapshot, now);
  }
  // True when this ink was not recently sent.
  private isUncheckedInk(snapshot: BoardSnapshot) {
    return this.checked.every((ink) => inkChanged(snapshot.ink, ink, this.game.session.board));
  }
  // Samples a camera frame and checks a stable board.
  observe(observation: Observation) {
    if (this.observationBlocked()) return;
    const now = performance.now();
    if (now - this.lastSampleAt < 120) return;
    this.lastSampleAt = now;
    const snapshot = this.stableSnapshot(observation, now);
    if (!snapshot || this.busy || now < this.nextRequestAt) return;
    if (this.isUncheckedInk(snapshot)) void this.check(snapshot);
  }
  // Checks the current camera board on demand.
  async checkNow() {
    if (!this.canCheck) return;
    if (!this.reply) await this.connect();
    if (!this.reply || !this.game.cameraFeed.canvas || this.game.blocked) return;
    if (!this.game.cameraFeed.hasReadyFrame()) {
      this.message = "Hold the whole board still and move your hand away, then try again.";
      return;
    }
    await this.check(captureBoard(this.game.cameraFeed.canvas, this.game.corners), "manual");
  }
  // Syncs a newer session after a failed check, or forgets the view so it is retried.
  private async recoverCheck(snapshot: BoardSnapshot, epoch: number, error: unknown) {
    runInAction(() => {
      this.message = error instanceof Error ? error.message : "Could not check the board. Try again.";
    });
    let recovered = false;
    try {
      const latest = await post("sync", {
        sessionId: this.reply!.sessionId,
        revision: this.reply!.revision,
      });
      if (epoch === this.epoch && latest.revision > this.reply!.revision) {
        runInAction(() => this.apply(latest));
        recovered = true;
      }
    } catch {}
    if (epoch !== this.epoch || recovered) return;
    this.forgetSnapshotInk(snapshot);
  }
  // The server never saw this view, so the backoff should retry the same board.
  private forgetSnapshotInk(snapshot: BoardSnapshot) {
    this.checked = this.checked.filter((ink) => ink !== snapshot.ink);
  }
  // Marks the check as in flight.
  private beginCheck(snapshot: BoardSnapshot) {
    const controller = this.beginRequest();
    this.busy = true;
    this.message = "";
    this.checked = [...this.checked, snapshot.ink].slice(-4);
    this.reviewImage = snapshot.image;
    return controller;
  }
  // Replaces the controller used to cancel the current request.
  private beginRequest() {
    const controller = new AbortController();
    this.controller = controller;
    return controller;
  }
  // Ends a check and sets the next request delay.
  private finishCheck(epoch: number, requestFailed: boolean, requestStartedAt: number) {
    if (epoch !== this.epoch) return;
    runInAction(() => {
      this.busy = false;
      this.nextRequestAt = requestFailed ? performance.now() + 15000 : Math.max(requestStartedAt + 2000, performance.now() + 400);
    });
  }
  // Sends a board image to the agent for analysis.
  private async check(snapshot: BoardSnapshot, trigger: AnalyzeTrigger = "automatic") {
    if (!this.reply || this.busy) return;
    const epoch = this.epoch;
    let requestFailed = false;
    const requestStartedAt = performance.now();
    const controller = this.beginCheck(snapshot);
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
        AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
      );
      if (epoch !== this.epoch) return;
      runInAction(() => {
        this.apply(reply);
      });
    } catch (error) {
      requestFailed = true;
      if (epoch !== this.epoch) return;
      await this.recoverCheck(snapshot, epoch, error);
    } finally {
      if (this.controller === controller) this.controller = null;
      this.finishCheck(epoch, requestFailed, requestStartedAt);
    }
  }
  // Writes an agent reply onto the game session.
  private apply(reply: GameAgentReply) {
    this.reply = reply;
    this.game.preparingBoard = false;
    this.game.play.session = {
      ...reply.session,
      paused: this.game.session.paused,
    };
    this.message = reply.status === "ready" ? (reply.notice ?? "") : reply.message;
  }
  // Opens the board correction dialog.
  openCorrection() {
    if (this.reply?.analysis && !this.busy) this.correctionOpen = true;
  }
  // Closes the board correction dialog.
  closeCorrection() {
    this.correctionOpen = false;
  }
  // Sends a corrected board back to the agent.
  async correct(board: Board) {
    if (!this.reply || this.busy) return;
    const epoch = this.epoch;
    const controller = this.beginRequest();
    this.busy = true;
    try {
      const reply = await post(
        "feedback",
        {
          sessionId: this.reply.sessionId,
          revision: this.reply.revision,
          board,
        },
        controller.signal,
      );
      if (epoch === this.epoch)
        runInAction(() => {
          this.apply(reply);
          this.correctionOpen = false;
        });
    } catch (error) {
      if (epoch === this.epoch)
        runInAction(() => {
          this.message = error instanceof Error ? error.message : "Could not save the correction.";
        });
    } finally {
      if (this.controller === controller) this.controller = null;
      if (epoch === this.epoch)
        runInAction(() => {
          this.busy = false;
        });
    }
  }
}
