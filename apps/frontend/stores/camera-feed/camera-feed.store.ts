import { makeAutoObservable } from "mobx";
import { runInAction } from "mobx";
import { MAX_OBSERVATION_GAP_MS } from "@shared/session-helpers/session.helpers";
import { FrameReader } from "./helpers/frame-reader.helpers";
import { drawSample } from "./helpers/sample-board.helpers";
import { SAMPLE_CORNERS } from "./helpers/sample-board.helpers";
import { isInGame } from "../../types";
import type { Board } from "../../types";
import type { Corners } from "../../types";
import type { Observation } from "../../types";
import type { Point } from "../../types";
import type { Session } from "../../types";
import type { Source } from "../../types";
import type { Stage } from "../../types";
import type { WorkerReply } from "../../types";

export const ANALYSIS_FPS = 16;

type TickPass = {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  src: Source;
  currentStage: Stage;
  state: Session;
  now: number;
  replaying: boolean;
};

// Returns a 2D context that can read canvas pixels.
function canvasReadContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read the video canvas.");
  return context;
}

// Reads the current canvas pixels.
function readCanvasImage(canvas: HTMLCanvasElement): ImageData {
  return canvasReadContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

// Draws the current video frame onto the canvas.
function copyVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, onResize: (ratio: number) => void): boolean {
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return false;
  const width = 960;
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    onResize(width / height);
  }
  const context = canvasReadContext(canvas);
  context.imageSmoothingQuality = "high";
  context.drawImage(video, 0, 0, width, height);
  return true;
}

// Returns the first video track from a stream.
function cameraTrack(stream: MediaStream | null): MediaStreamTrack | undefined {
  return stream?.getVideoTracks()[0];
}

// True when the camera track is still live.
function isConnectedTrack(track: MediaStreamTrack | undefined): track is MediaStreamTrack {
  return track !== undefined && track.readyState === "live";
}

// True when the camera track is live and unmuted.
function isLiveTrack(track: MediaStreamTrack | undefined): track is MediaStreamTrack {
  return isConnectedTrack(track) && !track.muted;
}

// True when video time jumped earlier than the last reading.
function videoWentBackwards(mediaTime: number, lastObservationAt: number | null): boolean {
  return lastObservationAt !== null && mediaTime * 1000 < lastObservationAt;
}

export type CameraFeedHost = {
  readonly source: Source;
  readonly stage: Stage;
  readonly needsRestart: boolean;
  readonly session: Session;
  readonly usesRemoteAgent: boolean;
  onBoardDetected(board: Board): boolean;
  onObservation(observation: Observation, videoEnded: boolean): void;
  onSourceStarted(ready: boolean): void;
  onCameraAvailability(status: "muted" | "unmuted" | "fresh"): void;
  onFeedFailure(message: string, duringStartup?: boolean): void;
  onPlaybackInterrupted(message?: string, unavailable?: boolean): void;
  onFeedNotice(message: string): void;
  onDetectionFailure(message: string): void;
  onBoardNotFound(): void;
  onVideoEnded(pending: boolean): void;
};

type VideoFrame = {
  sequence: number;
  mediaTime: number;
  receivedAt: number;
};

export class CameraFeedStore {
  observation: Observation | null = null;
  corners: Point[] = [];
  detectedBoard: Board | null = null;
  frameRatio = 4 / 3;
  readerReady = false;
  readingRate = 0;
  canvas: HTMLCanvasElement | null = null;
  video: HTMLVideoElement | null = null;
  stream: MediaStream | null = null;
  observationHistory: Observation[] = [];
  sampleBoard: Board = Array(9).fill(null);
  epoch = 0;
  playbackIntent = 0;
  fileUrl: string | null = null;
  nextSampleAt = 0;
  lastVideoTime: number | null = null;
  videoFrameCallback: number | null = null;
  videoFrame: VideoFrame | null = null;
  processedVideoFrame: number | null = null;
  readingStartedAt = 0;
  nextDetectionAt = 0;
  nextAnalysisAt = 0;
  nextVideoSlot = 0;
  private readonly reader = new FrameReader(
    (reply) => runInAction(() => this.handleWorkerReply(reply)),
    (message) => this.failReader(message),
  );
  private analysisTimer: number | null = null;

  // Wires the feed to the host game store.
  constructor(private readonly host: CameraFeedHost) {
    makeAutoObservable<CameraFeedStore, "analysisTimer" | "host" | "reader">(
      this,
      {
        host: false,
        reader: false,
        videoEnded: false,
        canvas: false,
        video: false,
        stream: false,
        observationHistory: false,
        sampleBoard: false,
        epoch: false,
        playbackIntent: false,
        fileUrl: false,
        nextSampleAt: false,
        lastVideoTime: false,
        videoFrameCallback: false,
        processedVideoFrame: false,
        videoFrame: false,
        readingStartedAt: false,
        nextDetectionAt: false,
        nextAnalysisAt: false,
        nextVideoSlot: false,
        analysisTimer: false,
      },
      { autoBind: true },
    );
  }

  // Stores the drawing canvas element.
  attachCanvas(element: HTMLCanvasElement | null) {
    this.canvas = element;
  }

  // Stores the video element.
  attachVideo(element: HTMLVideoElement | null) {
    this.video = element;
  }

  // True when the current frame is still and readable.
  hasReadyFrame() {
    return !this.reader.busy && this.observation?.quality === "good";
  }

  // Returns a copy of past observations.
  getObservationHistory() {
    return [...this.observationHistory];
  }

  // Starts the analysis loop and preview.
  start() {
    if (this.analysisTimer !== null) return;
    this.drawPreview();
    this.video?.addEventListener("ended", this.onVideoEnded);
    this.analysisTimer = window.setInterval(this.tick, 16);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  // Stops the analysis loop and source.
  dispose() {
    this.video?.removeEventListener("ended", this.onVideoEnded);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.analysisTimer !== null) window.clearInterval(this.analysisTimer);
    this.analysisTimer = null;
    this.stopSource();
  }

  // Clears corners, observations, and reading rate.
  clearReadings() {
    this.observation = null;
    this.corners = [];
    this.detectedBoard = null;
    this.observationHistory = [];
    this.readingRate = 0;
    this.frameRatio = 4 / 3;
  }

  // Draws the welcome sample board.
  drawPreview() {
    if (!this.canvas) return;
    drawSample(this.canvas, ["X", null, null, null, "O", null, null, null, "X"], true);
  }

  // Stops the source and starts a fresh reader.
  prepareWorker() {
    this.stopSource();
    this.clearReadings();
    this.nextDetectionAt = 0;
    this.readerReady = this.reader.start();
    return this.readerReady;
  }

  // Calibrates the synthetic sample board.
  startSample() {
    this.sampleBoard = Array(9).fill(null);
    drawSample(this.canvas!, this.sampleBoard);
    this.frameRatio = 4 / 3;
    this.corners = SAMPLE_CORNERS;
    this.calibrate(SAMPLE_CORNERS);
  }

  // Loads a recorded video file.
  openVideo(file: File) {
    const url = URL.createObjectURL(file);
    this.fileUrl = url;
    const video = this.video!;
    video.src = url;
    this.beginVideoFrames(video, this.epoch);
    video.addEventListener("loadeddata", this.onVideoLoadedData);
    video.addEventListener("error", this.onVideoError);
    video.load();
  }

  // Starts a live camera stream.
  async startCamera(facingMode: "user" | "environment" = "environment") {
    const epoch = this.epoch;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs localhost or HTTPS. Open this app on localhost on this computer.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 960 },
          facingMode: { ideal: facingMode },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      if (epoch !== this.epoch) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      runInAction(() => this.applyCameraStream(stream, epoch));
    } catch (cause) {
      if (epoch !== this.epoch) return;
      runInAction(() => this.failCameraStart(cause));
    }
  }

  // Attaches a new camera stream and starts playback.
  private applyCameraStream(stream: MediaStream, epoch: number) {
    this.stream = stream;
    const track = cameraTrack(stream);
    track?.addEventListener("ended", () => {
      if (this.stream === stream) {
        this.failReader("The camera disconnected. Your confirmed moves remain in move history. Reconnect it and start a new session.");
      }
    });
    track?.addEventListener("mute", () => this.onCameraMute(stream));
    track?.addEventListener("unmute", () => this.onCameraUnmute(stream, track));
    void this.playCameraVideo(epoch, track);
  }

  // Looks for the board again from the current source.
  detectAgain() {
    if (!this.readerReady) return false;
    this.pausePlayback();
    this.nextVideoSlot = 0;
    this.processedVideoFrame = null;
    if (this.host.source === "video" && this.video?.ended) {
      this.video.currentTime = 0;
    }
    this.observation = null;
    this.corners = [];
    this.detectedBoard = null;
    this.nextDetectionAt = 0;
    if (this.host.source === "sample") {
      this.corners = SAMPLE_CORNERS;
      this.calibrate(SAMPLE_CORNERS);
    }
    return true;
  }

  // Pauses video playback and cancels the reader.
  pausePlayback() {
    this.reader.cancel();
    this.playbackIntent++;
    if (this.host.source === "video") this.video?.pause();
  }

  // True when a video source has finished.
  get videoEnded() {
    return this.host.source === "video" && this.video?.ended === true;
  }

  // Stops the source and reports a reader failure.
  private failReader(message: string) {
    this.stopSource();
    this.host.onFeedFailure(message);
  }

  // Stops startup and explains why the camera failed.
  private failCameraStart(cause: unknown) {
    this.stopSource();
    const name = cause instanceof Error ? cause.name : "";
    this.host.onFeedFailure(cameraStartError(name, cause), true);
  }

  // Copies the current video frame onto the canvas.
  private copySourceFrame(video: HTMLVideoElement) {
    return copyVideoFrame(video, this.canvas!, (ratio) => {
      this.frameRatio = ratio;
    });
  }

  // Resumes video playback or reports a failure.
  private playVideo() {
    const video = this.video;
    if (!video) return;
    const epoch = this.epoch;
    const intent = ++this.playbackIntent;
    void video
      .play()
      .then(() => {
        if (epoch !== this.epoch || intent !== this.playbackIntent) return;
        runInAction(() => {
          this.host.onFeedNotice("");
        });
      })
      .catch(() => {
        if (epoch !== this.epoch || intent !== this.playbackIntent) return;
        video.pause();
        runInAction(() => {
          this.host.onPlaybackInterrupted("The video could not resume. Press Resume to try again, or start a new session.");
        });
      });
  }

  // Uses the first video frame once it is ready.
  private onVideoLoadedData() {
    if (!this.fileUrl || this.host.stage !== "starting") return;
    const video = this.video;
    if (!video) return;
    video.pause();
    try {
      if (!this.canvas || !this.copySourceFrame(video)) throw new Error();
    } catch {
      this.failReader("The video did not provide a usable first frame. Start a new session and load a different recording.");
      return;
    }
    this.host.onSourceStarted(true);
  }

  // Reports that the video file cannot be decoded.
  private onVideoError() {
    if (!this.fileUrl) return;
    this.failReader("This video cannot be decoded. Try an MP4 or WebM that starts with an empty board.");
  }

  // Stops the camera, video, and reader.
  stopSource() {
    this.epoch++;
    this.playbackIntent++;
    this.reader.dispose();
    this.readerReady = false;
    this.lastVideoTime = null;
    this.videoFrame = null;
    this.processedVideoFrame = null;
    this.nextVideoSlot = 0;
    this.nextAnalysisAt = 0;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
    this.detachVideoSource();
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = null;
  }

  // Clears the video element and its listeners.
  private detachVideoSource() {
    const video = this.video;
    if (!video) return;
    if (this.videoFrameCallback !== null) {
      video.cancelVideoFrameCallback?.(this.videoFrameCallback);
    }
    this.videoFrameCallback = null;
    video.removeEventListener("loadeddata", this.onVideoLoadedData);
    video.removeEventListener("error", this.onVideoError);
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  }

  // Routes a worker reply to the matching handler.
  private handleWorkerReply(data: WorkerReply) {
    if (data.type === "detected" || data.type === "calibrated") {
      this.handleDetectReply(data);
      return;
    }
    if (data.type === "error") {
      this.handleErrorReply(data);
      return;
    }
    if (data.type === "observation" && isInGame(this.host.stage)) {
      this.handleObservationReply(data);
    }
  }

  // Records a found board or asks to look again.
  private handleDetectReply(data: Extract<WorkerReply, { type: "detected" | "calibrated" }>) {
    if (this.host.stage !== "detecting" && this.host.stage !== "calibrating") return;
    if (!data.corners) {
      this.host.onBoardNotFound();
      return;
    }
    this.corners = data.corners;
    this.detectedBoard = data.board;
    if (this.host.onBoardDetected(data.board)) this.observation = null;
  }

  // Starts the delay before live board readings.
  beginReading() {
    this.readingStartedAt = performance.now();
    this.nextSampleAt = performance.now() + 1800;
  }

  // Maps a worker error onto the host.
  private handleErrorReply(data: Extract<WorkerReply, { type: "error" }>) {
    const message = data.message || "The page could not be read. Check the lighting and frame it again.";
    if (this.host.stage === "calibrating" || this.host.stage === "detecting") {
      this.corners = [];
      this.detectedBoard = null;
      this.host.onDetectionFailure(message);
    } else if (isInGame(this.host.stage)) {
      if (this.videoEnded) this.host.onVideoEnded(false);
      else this.host.onPlaybackInterrupted(message);
    } else {
      this.host.onFeedNotice(message);
    }
  }

  // Stores a board observation and tells the host.
  private handleObservationReply(data: Extract<WorkerReply, { type: "observation" }>) {
    this.observationHistory.push(data.observation);
    if (this.observationHistory.length > 2048) this.observationHistory.shift();
    this.updateReadingRate(data.observation);
    this.observation = data.observation;
    if (data.observation.corners) this.corners = data.observation.corners;
    this.host.onObservation(data.observation, this.videoEnded);
  }

  // Updates how many readings arrived in the last second.
  private updateReadingRate(observation: Observation) {
    const recent = this.observationHistory.filter((frame) => frame.timestamp >= observation.timestamp - 1000);
    const span = recent.length > 1 ? observation.timestamp - recent[0].timestamp : 0;
    this.readingRate = span > 0 ? ((recent.length - 1) * 1000) / span : 0;
  }

  // Tells the host the camera stopped sending frames.
  private onCameraMute(stream: MediaStream) {
    if (this.stream !== stream) return;
    if (isInGame(this.host.stage) || this.host.stage === "calibrating") this.reader.cancel();
    this.host.onCameraAvailability("muted");
  }

  // Tells the host the camera picture returned.
  private onCameraUnmute(stream: MediaStream, track: MediaStreamTrack) {
    if (this.stream !== stream || !isConnectedTrack(track)) return;
    if (this.host.stage === "corners") {
      this.corners = [];
      this.nextDetectionAt = 0;
    }
    this.host.onCameraAvailability("unmuted");
  }

  // Plays the camera into the video element.
  private async playCameraVideo(epoch: number, track: MediaStreamTrack | undefined) {
    const video = this.video!;
    video.srcObject = this.stream;
    this.beginVideoFrames(video, epoch);
    try {
      await video.play();
      if (epoch !== this.epoch) return;
      if (!this.canvas || !this.copySourceFrame(video)) throw new Error("The camera did not provide a usable frame. Start the camera again.");
      runInAction(() => {
        this.host.onSourceStarted(isLiveTrack(track));
      });
    } catch (cause) {
      if (epoch !== this.epoch) return;
      runInAction(() => this.failCameraStart(cause));
    }
  }

  // Listens for each new video frame.
  private beginVideoFrames(video: HTMLVideoElement, epoch: number) {
    if (!video.requestVideoFrameCallback) return;
    // Records the latest video frame metadata.
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (epoch !== this.epoch) return;
      this.videoFrame = {
        sequence: (this.videoFrame?.sequence ?? 0) + 1,
        mediaTime: metadata.mediaTime,
        receivedAt: performance.now(),
      };
      this.videoFrameCallback = video.requestVideoFrameCallback(onFrame);
    };
    this.videoFrameCallback = video.requestVideoFrameCallback(onFrame);
  }

  // True when a live camera can resume play.
  ensureLiveCameraForResume() {
    if (this.host.source !== "camera") return true;
    const track = cameraTrack(this.stream);
    if (!isConnectedTrack(track)) {
      this.failReader("The camera is disconnected. Reconnect it and start a new session.");
      return false;
    }
    if (track.muted || !this.video || this.video.readyState < 2 || this.video.paused) {
      this.host.onPlaybackInterrupted("Wait for the live camera picture to return before resuming.", true);
      return false;
    }
    return true;
  }

  // Clears notices and resumes video playback.
  resumePlayback() {
    this.readingStartedAt = performance.now();
    this.host.onFeedNotice("");
    if (this.host.source === "video") this.playVideo();
  }

  // Sends four corners to the worker for calibration.
  calibrate(points: readonly Point[]) {
    const canvas = this.canvas;
    if (!canvas || !this.readerReady || this.reader.busy || this.host.stage !== "calibrating") return;
    if (points.length !== 4) {
      this.host.onDetectionFailure("The grid outline is incomplete. Detect again to find the whole board.");
      return;
    }
    const calibrationCorners: Corners = [points[0], points[1], points[2], points[3]];
    try {
      if (!this.captureCalibrationFrame()) return;
      const image = readCanvasImage(canvas);
      this.host.onFeedNotice("");
      this.reader.send({
        type: "calibrate",
        image,
        corners: calibrationCorners,
      });
    } catch {
      this.reader.cancel();
      this.host.onDetectionFailure("The current frame could not be read. Hold the page still and choose Detect again.");
    }
  }

  // Copies a live frame before calibration.
  private captureCalibrationFrame() {
    if (this.host.source !== "camera" && this.host.source !== "video") return true;
    const video = this.video;
    if (!video || (this.host.source === "camera" && !isLiveTrack(cameraTrack(this.stream))) || !this.copySourceFrame(video)) {
      this.host.onDetectionFailure("Wait for the live picture to return, then choose Detect again.");
      return false;
    }
    return true;
  }

  // Copies, detects, and sends the next analysis frame.
  private tick() {
    const canvas = this.canvas;
    const video = this.video;
    if (!canvas || !video || this.reader.busy) return;
    const src = this.host.source;
    const currentStage = this.host.stage;
    const state = this.host.session;
    const now = performance.now();
    const replaying = src === "video" && isInGame(currentStage);
    if (!replaying) {
      if (now < this.nextAnalysisAt) return;
      this.nextAnalysisAt = now + 1000 / ANALYSIS_FPS;
    }
    if (this.reader.busy) return;
    const pass: TickPass = {
      canvas,
      video,
      src,
      currentStage,
      state,
      now,
      replaying,
    };
    const copied = this.tickCopySource(pass);
    if (copied === null) return;
    if (this.tickDetect(pass, copied)) return;
    this.tickSample(pass);
    if (this.tickStaleCheck(pass)) return;
    this.tickSendFrame(pass, copied);
  }

  // Copies a new source frame when one is ready.
  private tickCopySource(pass: TickPass) {
    if (pass.src !== "camera" && pass.src !== "video") return false;
    const mediaTime = typeof pass.video.requestVideoFrameCallback === "function" ? this.videoFrame?.mediaTime : pass.video.currentTime;
    const mediaSlot = mediaTime === undefined ? -1 : Math.floor(mediaTime * ANALYSIS_FPS);
    let sourceFrameReady = false;
    try {
      if (
        shouldCopySource({
          store: this,
          video: pass.video,
          state: pass.state,
          replaying: pass.replaying,
          mediaTime,
          mediaSlot,
        })
      )
        sourceFrameReady = this.copySourceFrame(pass.video);
    } catch {
      this.failReader("The current video frame could not be displayed. Start a new session to reconnect the source.");
      return null;
    }
    this.syncFallbackVideoFrame(pass.video, pass.now, sourceFrameReady);
    this.refreshPausedCameraReady(pass.src, pass.state, pass.now);
    return sourceFrameReady;
  }

  // Tracks video time when frame callbacks are missing.
  private syncFallbackVideoFrame(video: HTMLVideoElement, now: number, sourceFrameReady: boolean) {
    if (!sourceFrameReady || typeof video.requestVideoFrameCallback === "function" || video.paused || video.ended || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    this.videoFrame = {
      sequence: (this.videoFrame?.sequence ?? 0) + 1,
      mediaTime: video.currentTime,
      receivedAt: now,
    };
  }

  // Marks a paused camera fresh when frames are still arriving.
  private refreshPausedCameraReady(src: Source, state: Session, now: number) {
    if (src !== "camera" || !state.paused || this.host.needsRestart || !this.videoFrame || now - this.videoFrame.receivedAt >= MAX_OBSERVATION_GAP_MS) return;
    if (isLiveTrack(cameraTrack(this.stream))) this.host.onCameraAvailability("fresh");
  }

  // Sends a detect request while looking for the board.
  private tickDetect(pass: TickPass, sourceFrameReady: boolean) {
    if (pass.currentStage !== "detecting") return false;
    if (!this.canSendDetect(pass.src, pass.now, sourceFrameReady)) return true;
    this.nextDetectionAt = pass.now + 800;
    try {
      this.reader.send({
        type: "detect",
        image: readCanvasImage(pass.canvas),
      });
    } catch {
      this.failReader("The current frame could not be read. Start a new session to reconnect the source.");
    }
    return true;
  }

  // True when a detect request can be sent now.
  private canSendDetect(src: Source, now: number, sourceFrameReady: boolean) {
    if (!sourceFrameReady || document.hidden || this.reader.busy || !this.readerReady || now < this.nextDetectionAt) return false;
    return !this.cameraDetectBlocked(src, now);
  }

  // True when the live camera is too stale to detect.
  private cameraDetectBlocked(src: Source, now: number) {
    if (src !== "camera") return false;
    return !isLiveTrack(cameraTrack(this.stream)) || !this.videoFrame || now - this.videoFrame.receivedAt > MAX_OBSERVATION_GAP_MS;
  }

  // Advances and redraws the synthetic sample board.
  private tickSample(pass: TickPass) {
    if (pass.src !== "sample" || !isInGame(pass.currentStage) || pass.state.paused || pass.state.phase === "finished" || pass.state.recoveryReason) return;
    const physical = this.sampleBoard;
    if (physical.every((mark, index) => mark === pass.state.board[index]) && performance.now() > this.nextSampleAt) {
      advanceSampleBoard(physical, pass.state);
      this.nextSampleAt = performance.now() + 2300;
    }
    drawSample(pass.canvas, physical);
  }

  // Pauses play when camera or video frames go stale.
  private tickStaleCheck(pass: TickPass) {
    if (!isInGame(pass.currentStage) || pass.state.paused || (pass.src !== "camera" && pass.src !== "video") || pass.video.ended) return false;
    const lastFreshAt = Math.max(this.readingStartedAt, this.videoFrame?.receivedAt ?? 0);
    if (pass.now - lastFreshAt <= MAX_OBSERVATION_GAP_MS) return false;
    this.host.onPlaybackInterrupted(
      pass.src === "camera"
        ? "The camera stopped sending fresh frames. Resume when the live picture returns, or start a new session to reconnect it."
        : "Video playback stopped advancing. Press Resume to try again, or load the recording in a new session.",
      pass.src === "camera",
    );
    return true;
  }

  // Sends the current canvas to the reader during play.
  private tickSendFrame(pass: TickPass, sourceFrameReady: boolean) {
    if (!isInGame(pass.currentStage) || pass.state.paused || this.reader.busy || !this.readerReady) return;
    if (pass.src === "camera" || pass.src === "video") {
      if (!this.prepareLiveFrame(pass, sourceFrameReady)) return;
    }
    try {
      const image = readCanvasImage(pass.canvas);
      const timestamp = pass.src === "video" ? this.videoFrame!.mediaTime * 1000 : pass.now;
      this.reader.send({
        type: "frame",
        image,
        timestamp,
        board: [...pass.state.board],
      });
    } catch {
      this.failReader("The current frame could not be read. Start a new session to reconnect the source.");
    }
  }

  // Accepts a new live frame and rejects a rewind.
  private prepareLiveFrame(pass: TickPass, sourceFrameReady: boolean) {
    const frame = this.videoFrame;
    if (!sourceFrameReady || pass.video.paused || pass.video.ended || !frame || frame.sequence === this.processedVideoFrame) return false;
    if (pass.src === "video" && videoWentBackwards(frame.mediaTime, pass.state.lastObservationAt)) {
      this.failReader("The video moved backwards. Start a new session before replaying earlier moves.");
      return false;
    }
    this.processedVideoFrame = frame.sequence;
    if (pass.src === "video") this.nextVideoSlot = Math.floor(frame.mediaTime * ANALYSIS_FPS) + 1;
    return true;
  }

  // Tells the host a live video ended.
  private onVideoEnded() {
    if (this.host.source !== "video" || !isInGame(this.host.stage)) return;
    this.host.onVideoEnded(this.reader.busy);
  }

  // Pauses play when the tab hides during a game.
  private onVisibilityChange() {
    if (!document.hidden || !isInGame(this.host.stage)) return;
    if (this.host.source === "video" && this.video?.ended) return;
    runInAction(() => {
      this.host.onPlaybackInterrupted();
    });
  }
}

// Explains why the camera could not start.
function cameraStartError(name: string, cause: unknown): string {
  if (name === "NotAllowedError") return "Camera permission was declined. Allow camera access in your browser, then try again. You can also watch the demo in Tutorial.";
  if (name === "NotFoundError") return "No camera was found. Connect a webcam or watch the demo in Tutorial.";
  if (name === "NotReadableError") return "Your camera is busy. Close the app using it, then try again.";
  return cause instanceof Error ? cause.message : "Could not start the camera. Try again.";
}

// True when the current video slot should be copied.
function shouldCopySource(input: { store: CameraFeedStore; video: HTMLVideoElement; state: Session; replaying: boolean; mediaTime: number | undefined; mediaSlot: number }): boolean {
  const movedBackwards = input.replaying && input.mediaTime !== undefined && videoWentBackwards(input.mediaTime, input.state.lastObservationAt);
  return !input.replaying || movedBackwards || (!input.state.paused && !input.video.paused && !input.video.ended && input.mediaSlot >= input.store.nextVideoSlot);
}

// Adds the next sample mark for the current turn.
function advanceSampleBoard(physical: Board, state: Session) {
  const humanChoices = [0, 8, 6, 1, 5, 2, 3, 7, 4];
  const cell = state.phase === "draw-ai" ? state.pendingMove : humanChoices.find((index) => physical[index] === null);
  if (cell !== null && cell !== undefined) physical[cell] = state.phase === "draw-ai" ? "O" : "X";
}
