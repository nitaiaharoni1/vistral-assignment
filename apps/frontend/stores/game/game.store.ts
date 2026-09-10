import { makeAutoObservable } from "mobx";
import { isInGame } from "../../types";
import { isSettingUp } from "../../types";
import { isWelcome } from "../../types";
import type { Board } from "../../types";
import type { Observation } from "../../types";
import type { Source } from "../../types";
import type { Stage } from "../../types";
import { GameAgentStore } from "../game-agent/game-agent.store";
import { SessionStore } from "../session/session.store";
import { CameraFeedStore } from "../camera-feed/camera-feed.store";

export type { Source, Stage };

export class GameStore {
  readonly play = new SessionStore();
  readonly cameraFeed = new CameraFeedStore(this);
  readonly gameAgent = new GameAgentStore(this);
  source: Source = "none";
  stage: Stage = "idle";
  detectionHint = "";
  error = "";
  needsRestart = false;
  sourceReady = false;
  preparingBoard = false;

  // Creates the play, camera, and agent stores.
  constructor() {
    makeAutoObservable(this, { play: false, cameraFeed: false, gameAgent: false }, { autoBind: true });
  }

  // True when the camera agent is reading the board.
  get usesRemoteAgent() {
    return this.gameAgent.enabled;
  }

  // Returns the current play session.
  get session() {
    return this.play.session;
  }

  // Returns the displayed board reading.
  get observation() {
    const observed = this.cameraFeed.observation;
    if (!this.gameAgent.enabled || !observed) return observed;
    return {
      ...observed,
      cells: this.agentObservationCells() ?? this.blankObservationCells(observed),
    };
  }

  // Maps agent analysis cells onto the display board.
  private agentObservationCells() {
    return this.gameAgent.reply?.analysis?.cells.map((cell) => ({
      mark: cell.mark === "empty" ? null : cell.mark === "unknown" ? ("?" as const) : cell.mark,
      confidence: cell.confidence,
      ink: cell.mark === "empty" ? 0 : 0.02,
      readable: cell.mark !== "unknown",
    }));
  }

  // Blank unread cells when the agent has no analysis yet.
  private blankObservationCells(observed: Observation) {
    return observed.cells.map(() => ({
      mark: null,
      confidence: 0,
      ink: 0,
      readable: false,
    }));
  }

  // Returns the current board corners.
  get corners() {
    return this.cameraFeed.corners;
  }

  // Returns the last detected board.
  get detectedBoard() {
    return this.cameraFeed.detectedBoard;
  }

  // Returns the camera frame aspect ratio.
  get frameRatio() {
    return this.cameraFeed.frameRatio;
  }

  // Returns how fast frames are being read.
  get readingRate() {
    return this.cameraFeed.readingRate;
  }

  // True when the board reader is ready.
  get readerReady() {
    return this.cameraFeed.readerReady;
  }

  // True while a game is in progress.
  get inGame() {
    return isInGame(this.stage);
  }

  // True while the board is being set up.
  get settingUp() {
    return isSettingUp(this.stage);
  }

  // True on the welcome screen.
  get welcome() {
    return isWelcome(this.stage);
  }

  // True when play is paused or needs a restart.
  get blocked() {
    return this.inGame && (this.session.paused || this.needsRestart);
  }

  // True when a video file can be loaded.
  get canLoadVideo() {
    return this.stage === "idle";
  }

  // True when the video preview should show.
  get showVideo() {
    return !this.welcome && (this.source === "camera" || this.source === "video");
  }

  // True when a paused game can resume.
  get canResume() {
    return this.inGame && !this.needsRestart && this.sourceReady;
  }

  // True when the board can be detected again.
  get canDetectAgain() {
    return this.readerReady && this.source !== "none";
  }

  // True when a camera game has recognized marks.
  get hasUnsavedGame() {
    return this.source === "camera" && this.session.recognizedBoard.some((mark) => mark !== null);
  }

  // Stores the drawing canvas element.
  attachCanvas(element: HTMLCanvasElement | null) {
    this.cameraFeed.attachCanvas(element);
  }

  // Stores the video element.
  attachVideo(element: HTMLVideoElement | null) {
    this.cameraFeed.attachVideo(element);
  }

  // Returns a copy of past observations.
  getObservationHistory() {
    return this.cameraFeed.getObservationHistory();
  }

  // Starts the camera feed loop.
  start() {
    this.cameraFeed.start();
  }

  // Stops the agent and camera feed.
  dispose() {
    this.gameAgent.reset();
    this.cameraFeed.dispose();
  }

  // Returns the game to the welcome screen.
  reset() {
    this.gameAgent.reset();
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

  // Starts a new game from the current source.
  restartGame() {
    if (this.source === "sample") {
      this.startSample();
      return;
    }
    if (this.source !== "camera" || !this.cameraFeed.stream || this.needsRestart) {
      void this.startCamera();
      return;
    }
    this.gameAgent.reset();
    this.play.reset();
    this.preparingBoard = true;
    this.detectAgain();
  }

  // Starts the synthetic sample board.
  startSample() {
    if (!this.prepare("sample")) return;
    this.stage = "calibrating";
    this.cameraFeed.startSample();
  }

  // Starts a live camera session.
  async startCamera(facingMode: "user" | "environment" = "environment") {
    if (!this.prepare("camera")) return;
    await this.cameraFeed.startCamera(facingMode);
  }

  // Loads a recorded video as the source.
  openVideo(file: File) {
    if (!this.prepare("video")) return;
    this.cameraFeed.openVideo(file);
  }

  // Pauses or resumes a live game.
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

  // Looks for the board again.
  detectAgain() {
    if (!this.cameraFeed.readerReady) return;
    this.needsRestart = false;
    this.detectionHint = "";
    this.error = "";
    if (this.cameraFeed.videoEnded) this.sourceReady = true;
    this.stage = this.source === "sample" ? "calibrating" : "detecting";
    this.cameraFeed.detectAgain();
  }

  // Starts play from a found board.
  onBoardDetected(board: Board) {
    this.detectionHint = "";
    if (!this.beginPlayFromBoard(board)) return false;
    this.error = "";
    this.stage = "playing";
    this.cameraFeed.beginReading();
    if (document.hidden) this.play.pause();
    else this.cameraFeed.resumePlayback();
    return true;
  }

  // Starts the agent or resumes local play from the found board.
  private beginPlayFromBoard(board: Board) {
    try {
      if (this.gameAgent.enabled) void this.gameAgent.connect();
      else this.play.resumeFromBoard(board, this.source === "video" ? "replay" : "play");
      return true;
    } catch (error) {
      this.onDetectionFailure(error instanceof Error ? error.message : "The squares could not be read. Detect again.");
      return false;
    }
  }

  // Applies a new board reading.
  onObservation(observation: Observation, videoEnded: boolean) {
    if (this.gameAgent.enabled) this.gameAgent.observe(observation);
    else this.play.observe(observation);
    if (!videoEnded) return;
    this.sourceReady = false;
    if (this.session.phase === "finished") {
      this.needsRestart = false;
      this.error = "";
      return;
    }
    this.endVideoEarly();
  }

  // Stops play when the video ended before the game finished.
  private endVideoEarly() {
    this.needsRestart = true;
    this.error = "The video ended before the final board was confirmed. Start a new session with a recording that holds the final board still.";
    this.play.pause();
  }

  // Marks the source ready and starts detection.
  onSourceStarted(ready: boolean) {
    this.sourceReady = ready;
    this.stage = "detecting";
  }

  // Updates play when the camera mutes or returns.
  onCameraAvailability(status: "muted" | "unmuted" | "fresh") {
    this.sourceReady = status !== "muted";
    if (status === "fresh") return;
    if (status === "unmuted") this.applyCameraUnmuted();
    else if (this.inGame || this.stage === "calibrating") this.applyCameraMuted();
  }

  // Resumes detection after the camera comes back.
  private applyCameraUnmuted() {
    if (this.stage === "corners") this.stage = "detecting";
    this.error = this.session.paused ? "The camera is available again. Press Resume when the page is still." : "";
  }

  // Pauses play or waits when the camera drops frames.
  private applyCameraMuted() {
    this.error = this.inGame ? "The camera temporarily stopped sending frames. Resume once the live picture returns." : "The camera temporarily stopped sending frames. I’ll try again when the picture returns.";
    if (this.inGame) this.play.pause();
    else this.stage = "corners";
  }

  // Records a feed error and may require a restart.
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

  // Pauses play after a feed interrupt.
  onPlaybackInterrupted(message?: string, unavailable = false) {
    this.cameraFeed.pausePlayback();
    this.play.pause();
    if (unavailable) this.sourceReady = false;
    if (message !== undefined) this.error = message;
  }

  // Shows a feed message.
  onFeedNotice(message: string) {
    this.error = message;
  }

  // Records a failed board detection.
  onDetectionFailure(message: string) {
    this.error = message;
    this.stage = "corners";
  }

  // Asks the player to show the full grid.
  onBoardNotFound() {
    this.detectionHint = "Keep all four grid lines in view, with good light and your hand out of the way.";
  }

  // Handles a video that ended before the game finished.
  onVideoEnded(pending: boolean) {
    this.sourceReady = false;
    if (this.session.phase === "finished") return;
    if (!pending) {
      this.play.pause();
      this.needsRestart = true;
    }
    this.error = "The video ended before the game was confirmed. Use a recording that holds the final board still for at least a second.";
  }

  // Resets stores and prepares a new source.
  private prepare(newSource: Source) {
    this.gameAgent.reset();
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
