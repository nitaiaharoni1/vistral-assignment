import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { createSession } from "@shared/session-helpers/session.helpers";
import { observation } from "../../../../tests/helpers/boards.ts";
import { CameraFeedStore } from "./camera-feed.store";
import type { CameraFeedHost } from "./camera-feed.store";

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  // Records a posted worker message.
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  // No-op stand-in for Worker.terminate.
  terminate() {}
}

type MutableHost = {
  -readonly [K in keyof CameraFeedHost]: CameraFeedHost[K];
};

// Builds a mutable camera-feed host for tests.
function host(overrides: Partial<MutableHost> = {}): MutableHost {
  return {
    source: "none",
    stage: "idle",
    needsRestart: false,
    session: createSession(),
    usesRemoteAgent: false,
    onBoardDetected: vi.fn(() => true),
    onObservation: vi.fn(),
    onSourceStarted: vi.fn(),
    onCameraAvailability: vi.fn(),
    onFeedFailure: vi.fn(),
    onPlaybackInterrupted: vi.fn(),
    onFeedNotice: vi.fn(),
    onDetectionFailure: vi.fn(),
    onBoardNotFound: vi.fn(),
    onVideoEnded: vi.fn(),
    ...overrides,
  };
}

describe("CameraFeedStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
  });

  it("tracks a ready frame and caps observation history", () => {
    const feed = new CameraFeedStore(host());
    expect(feed.hasReadyFrame()).toBe(false);
    feed.observation = observation(".........", 10);
    expect(feed.hasReadyFrame()).toBe(true);
    feed.observationHistory = Array.from({ length: 2048 }, (_, index) => observation(".........", index));
    (
      feed as unknown as {
        handleObservationReply(data: { type: "observation"; id: number; observation: ReturnType<typeof observation> }): void;
      }
    ).handleObservationReply({
      type: "observation",
      id: 1,
      observation: observation(".........", 3000),
    });
    expect(feed.observationHistory).toHaveLength(2048);
    expect(feed.observationHistory.at(-1)?.timestamp).toBe(3000);
    expect(feed.getObservationHistory()).toHaveLength(feed.observationHistory.length);
  });

  it("clears readings and reports a finished video", () => {
    const current = host({ source: "video" });
    const feed = new CameraFeedStore(current);
    feed.observation = observation(".........", 10);
    feed.corners = [{ x: 0, y: 0 }];
    feed.clearReadings();
    expect(feed.observation).toBeNull();
    expect(feed.corners).toEqual([]);
    feed.video = { ended: true } as HTMLVideoElement;
    expect(feed.videoEnded).toBe(true);
  });

  it("fails detect when the worker is not ready", () => {
    const current = host({ stage: "detecting" });
    const feed = new CameraFeedStore(current);
    expect(feed.detectAgain()).toBe(false);
  });

  it("maps worker errors onto the host", () => {
    const current = host({ stage: "detecting" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleErrorReply(data: { type: "error"; id: number; message: string }): void;
      }
    ).handleErrorReply({ type: "error", id: 1, message: "No grid." });
    expect(current.onDetectionFailure).toHaveBeenCalledWith("No grid.");
  });

  it("interrupts a live game when the reader errors", () => {
    const current = host({ stage: "playing" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleErrorReply(data: { type: "error"; id: number; message: string }): void;
      }
    ).handleErrorReply({ type: "error", id: 2, message: "Blurry." });
    expect(current.onPlaybackInterrupted).toHaveBeenCalledWith("Blurry.");
  });

  it("surfaces a reader error as a notice off the board", () => {
    const current = host({ stage: "idle" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleErrorReply(data: { type: "error"; id: number; message: string }): void;
      }
    ).handleErrorReply({ type: "error", id: 3, message: "" });
    expect(current.onFeedNotice).toHaveBeenCalledWith("The page could not be read. Check the lighting and frame it again.");
  });

  it("keeps a finished video flag off for the camera", () => {
    const current = host({ source: "camera" });
    const feed = new CameraFeedStore(current);
    feed.video = { ended: true } as HTMLVideoElement;
    expect(feed.videoEnded).toBe(false);
  });

  it("does not treat a moving frame as ready", () => {
    const feed = new CameraFeedStore(host());
    feed.observation = observation(".........", 10, { quality: "moving" });
    expect(feed.hasReadyFrame()).toBe(false);
  });

  it("records a found board and asks again when none is found", () => {
    const current = host({ stage: "detecting" });
    const feed = new CameraFeedStore(current);
    const handle = feed as unknown as {
      handleDetectReply(data: { type: "detected"; id: number; corners: { x: number; y: number }[] | null; board: ("X" | "O" | null)[] }): void;
    };
    handle.handleDetectReply({
      type: "detected",
      id: 1,
      corners: null,
      board: Array(9).fill(null),
    });
    expect(current.onBoardNotFound).toHaveBeenCalledOnce();
    const corners = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ];
    feed.observation = observation(".........", 10);
    handle.handleDetectReply({
      type: "detected",
      id: 2,
      corners,
      board: Array(9).fill(null),
    });
    expect(current.onBoardDetected).toHaveBeenCalledOnce();
    expect(feed.corners).toEqual(corners);
    expect(feed.observation).toBeNull();
  });

  it("ignores a detect reply after the board is already in play", () => {
    const current = host({ stage: "playing" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleDetectReply(data: { type: "detected"; id: number; corners: { x: number; y: number }[]; board: ("X" | "O" | null)[] }): void;
      }
    ).handleDetectReply({
      type: "detected",
      id: 1,
      corners: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
      board: Array(9).fill(null),
    });
    expect(current.onBoardDetected).not.toHaveBeenCalled();
  });

  it("routes worker replies and ignores observations off the board", () => {
    const current = host({ stage: "idle" });
    const feed = new CameraFeedStore(current);
    const handle = feed as unknown as {
      handleWorkerReply(data: { type: string; id: number; message?: string; observation?: ReturnType<typeof observation>; corners?: null; board?: ("X" | "O" | null)[] }): void;
    };
    handle.handleWorkerReply({ type: "error", id: 1, message: "Hold still." });
    expect(current.onFeedNotice).toHaveBeenCalledWith("Hold still.");
    handle.handleWorkerReply({
      type: "observation",
      id: 2,
      observation: observation(".........", 10),
    });
    expect(current.onObservation).not.toHaveBeenCalled();
    current.stage = "playing";
    handle.handleWorkerReply({
      type: "observation",
      id: 3,
      observation: observation(".........", 20),
    });
    expect(current.onObservation).toHaveBeenCalledOnce();
  });

  it("starts and stops the analysis loop", () => {
    const feed = new CameraFeedStore(host());
    const video = document.createElement("video");
    feed.attachVideo(video);
    feed.start();
    feed.start();
    feed.dispose();
    expect(feed.readerReady).toBe(false);
  });

  it("prepares a worker and can detect again", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const current = host({ source: "camera", stage: "detecting" });
    const feed = new CameraFeedStore(current);
    expect(feed.prepareWorker()).toBe(true);
    expect(feed.readerReady).toBe(true);
    expect(feed.detectAgain()).toBe(true);
    expect(feed.observation).toBeNull();
  });

  it("explains camera start failures", async () => {
    const current = host({ source: "camera" });
    const feed = new CameraFeedStore(current);
    await feed.startCamera();
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/localhost or HTTPS/), true);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
      },
    });
    await feed.startCamera();
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/permission was declined/), true);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("gone"), { name: "NotFoundError" })),
      },
    });
    await feed.startCamera();
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/No camera was found/), true);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("busy"), { name: "NotReadableError" })),
      },
    });
    await feed.startCamera();
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/camera is busy/), true);
  });

  it("refuses resume when the camera is gone or muted", () => {
    const current = host({ source: "camera" });
    const feed = new CameraFeedStore(current);
    expect(feed.ensureLiveCameraForResume()).toBe(false);
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/camera is disconnected/));
    const track = {
      readyState: "live",
      muted: true,
    } as MediaStreamTrack;
    feed.stream = { getVideoTracks: () => [track] } as MediaStream;
    expect(feed.ensureLiveCameraForResume()).toBe(false);
    expect(current.onPlaybackInterrupted).toHaveBeenCalledWith(expect.stringMatching(/live camera picture/), true);
    current.source = "sample";
    expect(feed.ensureLiveCameraForResume()).toBe(true);
  });

  it("needs four corners and a ready reader to calibrate", () => {
    const current = host({ stage: "calibrating", source: "sample" });
    const feed = new CameraFeedStore(current);
    feed.canvas = document.createElement("canvas");
    feed.calibrate([{ x: 0, y: 0 }]);
    expect(current.onDetectionFailure).not.toHaveBeenCalled();
    feed.readerReady = true;
    feed.calibrate([{ x: 0, y: 0 }]);
    expect(current.onDetectionFailure).toHaveBeenCalledWith(expect.stringMatching(/grid outline is incomplete/));
  });

  it("pauses the video and notifies when the tab hides during play", () => {
    const current = host({ source: "video", stage: "playing" });
    const feed = new CameraFeedStore(current);
    const video = document.createElement("video");
    const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
    feed.attachVideo(video);
    feed.start();
    feed.pausePlayback();
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(current.onPlaybackInterrupted).toHaveBeenCalled();
    feed.dispose();
  });

  it("tells the host when a live video ends", () => {
    const current = host({ source: "video", stage: "playing" });
    const feed = new CameraFeedStore(current);
    const video = document.createElement("video");
    feed.attachVideo(video);
    feed.start();
    video.dispatchEvent(new Event("ended"));
    expect(current.onVideoEnded).toHaveBeenCalled();
    feed.dispose();
  });

  it("opens a video, rejects a bad file, and rewinds a finished clip", () => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal(
      "URL",
      class extends URL {
        // Returns a fake object URL.
        static createObjectURL() {
          return "blob:video";
        }
        // No-op stand-in for URL.revokeObjectURL.
        static revokeObjectURL() {}
      },
    );
    const current = host({ source: "video", stage: "starting" });
    const feed = new CameraFeedStore(current);
    const video = document.createElement("video");
    const canvas = readableCanvas();
    feed.attachVideo(video);
    feed.attachCanvas(canvas);
    feed.openVideo(new File(["x"], "board.webm", { type: "video/webm" }));
    video.dispatchEvent(new Event("error"));
    expect(current.onFeedFailure).toHaveBeenCalledWith(expect.stringMatching(/cannot be decoded/));
    const live = host({ source: "video", stage: "starting" });
    const second = new CameraFeedStore(live);
    second.attachVideo(video);
    second.attachCanvas(canvas);
    second.openVideo(new File(["x"], "ok.webm", { type: "video/webm" }));
    Object.defineProperty(video, "readyState", {
      value: 0,
      configurable: true,
    });
    video.dispatchEvent(new Event("loadeddata"));
    expect(live.onFeedFailure).toHaveBeenCalled();
    second.readerReady = true;
    live.stage = "detecting";
    Object.defineProperty(video, "ended", { value: true, configurable: true });
    expect(second.detectAgain()).toBe(true);
    second.dispose();
    feed.dispose();
  });

  it("starts a live camera and drops a stale stream", async () => {
    const track = {
      readyState: "live",
      muted: false,
      addEventListener: vi.fn(),
      stop: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const current = host({ source: "camera", stage: "starting" });
    const feed = new CameraFeedStore(current);
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", {
      value: 2,
      configurable: true,
    });
    Object.defineProperty(video, "videoWidth", { value: 640 });
    Object.defineProperty(video, "videoHeight", { value: 480 });
    video.play = () => Promise.resolve();
    feed.attachVideo(video);
    feed.attachCanvas(readableCanvas());
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => Promise.resolve(stream),
      },
    });
    await feed.startCamera();
    expect(current.onSourceStarted).toHaveBeenCalled();
    const late = host({ source: "camera" });
    const stale = new CameraFeedStore(late);
    stale.attachVideo(video);
    stale.attachCanvas(readableCanvas());
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => {
          stale.stopSource();
          return stream;
        },
      },
    });
    await stale.startCamera();
    expect(track.stop).toHaveBeenCalled();
    feed.dispose();
    stale.dispose();
  });

  it("calibrates four corners and resumes playback", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const current = host({ source: "sample", stage: "calibrating" });
    const feed = new CameraFeedStore(current);
    feed.attachCanvas(readableCanvas());
    expect(feed.prepareWorker()).toBe(true);
    feed.calibrate([
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ]);
    expect(current.onFeedNotice).toHaveBeenCalledWith("");
    current.stage = "playing";
    feed.beginReading();
    feed.resumePlayback();
    expect(current.onFeedNotice).toHaveBeenCalledWith("");
    (
      feed as unknown as {
        handleWorkerReply(data: { type: "calibrated"; id: number; corners: { x: number; y: number }[]; board: (null | "X" | "O")[] }): void;
      }
    ).handleWorkerReply({
      type: "calibrated",
      id: 1,
      corners: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
      board: Array(9).fill(null),
    });
    current.source = "sample";
    current.stage = "detecting";
    expect(feed.detectAgain()).toBe(true);
    feed.dispose();
  });

  it("ticks detect and stale camera frames", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const detecting = host({
      source: "camera",
      stage: "detecting",
      session: createSession(),
    });
    const finder = new CameraFeedStore(detecting);
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", {
      value: 2,
      configurable: true,
    });
    Object.defineProperty(video, "videoWidth", { value: 640 });
    Object.defineProperty(video, "videoHeight", { value: 480 });
    Object.defineProperty(video, "paused", {
      value: false,
      configurable: true,
    });
    finder.attachVideo(video);
    finder.attachCanvas(readableCanvas());
    expect(finder.prepareWorker()).toBe(true);
    finder.stream = {
      getVideoTracks: () => [{ readyState: "live", muted: false }],
      getTracks: () => [],
    } as unknown as MediaStream;
    finder.videoFrame = {
      sequence: 1,
      mediaTime: 1,
      receivedAt: performance.now(),
    };
    finder.nextAnalysisAt = 0;
    (finder as unknown as { tick(): void }).tick();
    finder.dispose();
    const live = host({ source: "camera", stage: "playing" });
    const feed = new CameraFeedStore(live);
    feed.attachVideo(video);
    feed.readingStartedAt = 0;
    feed.videoFrame = { sequence: 2, mediaTime: 2, receivedAt: 0 };
    (
      feed as unknown as {
        tickStaleCheck(pass: { canvas: HTMLCanvasElement; video: HTMLVideoElement; src: "camera"; currentStage: "playing"; state: ReturnType<typeof createSession>; now: number; replaying: boolean }): boolean;
      }
    ).tickStaleCheck({
      canvas: document.createElement("canvas"),
      video,
      src: "camera",
      currentStage: "playing",
      state: createSession(),
      now: 4000,
      replaying: false,
    });
    expect(live.onPlaybackInterrupted).toHaveBeenCalled();
    feed.dispose();
  });
});

// Builds a canvas whose pixels can be read in tests.
function readableCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 150;
  const pixels = {
    data: new Uint8ClampedArray(200 * 150 * 4).fill(220),
    width: 200,
    height: 150,
  };
  vi.spyOn(canvas, "getContext").mockReturnValue({
    getImageData: () => pixels,
    drawImage() {},
    imageSmoothingQuality: "high",
  } as unknown as CanvasRenderingContext2D);
  return canvas;
}
