import { makeAutoObservable } from "mobx";
import {
  isInGame,
  isSettingUp,
  isWelcome,
  type Board,
  type Observation,
  type Source,
  type Stage,
} from "../../types";
import { AgentStore } from "../agent/agent.store";
import { SessionStore } from "../session/session.store";
import { CameraFeedStore } from "../camera-feed/camera-feed.store";

export type { Source, Stage };

export class GameStore {
  readonly play = new SessionStore();
  readonly cameraFeed = new CameraFeedStore(this);
  readonly agent = new AgentStore(this);
  source: Source = "none";
  stage: Stage = "idle";
  detectionHint = "";
  error = "";
  needsRestart = false;
  sourceReady = false;
  preparingBoard = false;

  constructor() {
    makeAutoObservable(
      this,
      { play: false, cameraFeed: false, agent: false },
      { autoBind: true },
    );
  }

  get usesRemoteAgent() {
    return this.agent.enabled;
  }

  get session() {
    return this.play.session;
  }

  get observation() {
    const observed = this.cameraFeed.observation;
    if (!this.agent.enabled || !observed) return observed;
    return {
      ...observed,
      cells:
        this.agent.reply?.analysis?.cells.map((cell) => ({
          mark:
            cell.mark === "empty"
              ? null
              : cell.mark === "unknown"
                ? ("?" as const)
                : cell.mark,
          confidence: cell.confidence,
          ink: cell.mark === "empty" ? 0 : 0.02,
          readable: cell.mark !== "unknown",
        })) ??
        observed.cells.map(() => ({
          mark: null,
          confidence: 0,
          ink: 0,
          readable: false,
        })),
    };
  }

  get corners() {
    return this.cameraFeed.corners;
  }

  get detectedBoard() {
    return this.cameraFeed.detectedBoard;
  }

  get frameRatio() {
    return this.cameraFeed.frameRatio;
  }

  get readingRate() {
    return this.cameraFeed.readingRate;
  }

  get readerReady() {
    return this.cameraFeed.readerReady;
  }

  get inGame() {
    return isInGame(this.stage);
  }

  get settingUp() {
    return isSettingUp(this.stage);
  }

  get welcome() {
    return isWelcome(this.stage);
  }

  get blocked() {
    return this.inGame && (this.session.paused || this.needsRestart);
  }

  get canLoadVideo() {
    return this.stage === "idle";
  }

  get showVideo() {
    return (
      !this.welcome && (this.source === "camera" || this.source === "video")
    );
  }

  get canResume() {
    return this.inGame && !this.needsRestart && this.sourceReady;
  }

  get canDetectAgain() {
    return this.readerReady && this.source !== "none";
  }

  get hasUnsavedGame() {
    return (
      this.source === "camera" &&
      this.session.recognizedBoard.some((mark) => mark !== null)
    );
  }

  attachCanvas(element: HTMLCanvasElement | null) {
    this.cameraFeed.attachCanvas(element);
  }

  attachVideo(element: HTMLVideoElement | null) {
    this.cameraFeed.attachVideo(element);
  }

  getObservationHistory() {
    return this.cameraFeed.getObservationHistory();
  }

  start() {
    this.cameraFeed.start();
  }

  dispose() {
    this.agent.reset();
    this.cameraFeed.dispose();
  }

  reset() {
    this.agent.reset();
    this.preparingBoard = false;
    this.cameraFeed.stopSource();
    this.source = "none";
    this.stage = "idle";
    this.play.reset();
    this.cameraFeed.clearReadings();
    this.detectionHint = "";
    this.error = "";
    this.sourceReady = false;
    this.needsRestart = false;
    this.cameraFeed.drawPreview();
  }

  restartGame() {
    if (this.source === "sample") {
      this.startSample();
      return;
    }
    if (
      this.source !== "camera" ||
      !this.cameraFeed.stream ||
      this.needsRestart
    ) {
      void this.startCamera();
      return;
    }
    this.agent.reset();
    this.play.reset();
    this.preparingBoard = true;
    this.detectAgain();
  }

  startSample() {
    if (!this.prepare("sample")) return;
    this.stage = "calibrating";
    this.cameraFeed.startSample();
  }

  async startCamera(facingMode: "user" | "environment" = "environment") {
    if (!this.prepare("camera")) return;
    await this.cameraFeed.startCamera(facingMode);
  }

  openVideo(file: File) {
    if (!this.prepare("video")) return;
    this.cameraFeed.openVideo(file);
  }

  togglePause() {
    if (!this.inGame || !this.readerReady || this.needsRestart) return;
    if (this.cameraFeed.videoEnded) {
      this.error = "The video has ended. Start a new session to replay it.";
      return;
    }
    if (!this.session.paused) {
      this.onPlaybackInterrupted();
    } else if (this.cameraFeed.ensureLiveCameraForResume()) {
      this.cameraFeed.pausePlayback();
      this.play.resume();
      this.cameraFeed.resumePlayback();
    }
  }

  detectAgain() {
    if (!this.cameraFeed.readerReady) return;
    this.needsRestart = false;
    this.detectionHint = "";
    this.error = "";
    if (this.cameraFeed.videoEnded) this.sourceReady = true;
    this.stage = this.source === "sample" ? "calibrating" : "detecting";
    this.cameraFeed.detectAgain();
  }

  onBoardDetected(board: Board) {
    this.detectionHint = "";
    try {
      if (this.agent.enabled) void this.agent.connect();
      else
        this.play.resumeFromBoard(
          board,
          this.source === "video" ? "replay" : "play",
        );
    } catch (error) {
      this.onDetectionFailure(
        error instanceof Error
          ? error.message
          : "The squares could not be read. Detect again.",
      );
      return false;
    }
    this.error = "";
    this.stage = "playing";
    this.cameraFeed.beginReading();
    if (document.hidden) this.play.pause();
    else this.cameraFeed.resumePlayback();
    return true;
  }

  onObservation(observation: Observation, videoEnded: boolean) {
    if (this.agent.enabled) this.agent.observe(observation);
    else this.play.observe(observation);
    if (!videoEnded) return;
    this.sourceReady = false;
    if (this.session.phase !== "finished") {
      this.needsRestart = true;
      this.error =
        "The video ended before the final board was confirmed. Start a new session with a recording that holds the final board still.";
      this.play.pause();
      return;
    }
    this.needsRestart = false;
    this.error = "";
  }

  onSourceStarted(ready: boolean) {
    this.sourceReady = ready;
    this.stage = "detecting";
  }

  onCameraAvailability(status: "muted" | "unmuted" | "fresh") {
    this.sourceReady = status !== "muted";
    if (status === "fresh") return;
    if (status === "unmuted") {
      if (this.stage === "corners") this.stage = "detecting";
      this.error = this.session.paused
        ? "The camera is available again. Press Resume when the page is still."
        : "";
    } else if (this.inGame || this.stage === "calibrating") {
      this.error = this.inGame
        ? "The camera temporarily stopped sending frames. Resume once the live picture returns."
        : "The camera temporarily stopped sending frames. I’ll try again when the picture returns.";
      if (this.inGame) this.play.pause();
      else this.stage = "corners";
    }
  }

  onFeedFailure(message: string, duringStartup = false) {
    this.sourceReady = false;
    this.error = message;
    if (duringStartup) {
      this.stage = "idle";
      return;
    }
    this.needsRestart = true;
    if (!this.inGame) this.stage = "idle";
    this.play.pause();
  }

  onPlaybackInterrupted(message?: string, unavailable = false) {
    this.cameraFeed.pausePlayback();
    this.play.pause();
    if (unavailable) this.sourceReady = false;
    if (message !== undefined) this.error = message;
  }

  onFeedNotice(message: string) {
    this.error = message;
  }

  onDetectionFailure(message: string) {
    this.error = message;
    this.stage = "corners";
  }

  onBoardNotFound() {
    this.detectionHint =
      "Keep all four grid lines in view, with good light and your hand out of the way.";
  }

  onVideoEnded(pending: boolean) {
    this.sourceReady = false;
    if (this.session.phase === "finished") return;
    if (!pending) {
      this.play.pause();
      this.needsRestart = true;
    }
    this.error =
      "The video ended before the game was confirmed. Use a recording that holds the final board still for at least a second.";
  }

  private prepare(newSource: Source) {
    this.agent.reset();
    this.source = newSource;
    this.preparingBoard = newSource === "camera";
    this.play.reset(newSource === "video" ? "replay" : "play");
    this.detectionHint = "";
    this.error = "";
    this.sourceReady = newSource === "sample";
    this.needsRestart = false;
    this.stage = "starting";
    return this.cameraFeed.prepareWorker();
  }
}
