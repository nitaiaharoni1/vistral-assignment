import { describe, expect, it, vi } from "vitest";
import { createSession } from "@shared/session.helpers";
import { observation } from "../../../../tests/helpers/boards.ts";
import { CameraFeedStore, type CameraFeedHost } from "./camera-feed.store";

function host(overrides: Partial<CameraFeedHost> = {}): CameraFeedHost {
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
  it("tracks a ready frame and caps observation history", () => {
    const feed = new CameraFeedStore(host());
    expect(feed.hasReadyFrame()).toBe(false);
    feed.observation = observation(".........", 10);
    expect(feed.hasReadyFrame()).toBe(true);
    feed.observationHistory = Array.from({ length: 2048 }, (_, index) =>
      observation(".........", index),
    );
    (
      feed as unknown as {
        handleObservationReply(data: {
          type: "observation";
          id: number;
          observation: ReturnType<typeof observation>;
        }): void;
      }
    ).handleObservationReply({
      type: "observation",
      id: 1,
      observation: observation(".........", 3000),
    });
    expect(feed.observationHistory).toHaveLength(2048);
    expect(feed.observationHistory.at(-1)?.timestamp).toBe(3000);
    expect(feed.getObservationHistory()).toHaveLength(
      feed.observationHistory.length,
    );
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
        handleErrorReply(data: {
          type: "error";
          id: number;
          message: string;
        }): void;
      }
    ).handleErrorReply({ type: "error", id: 1, message: "No grid." });
    expect(current.onDetectionFailure).toHaveBeenCalledWith("No grid.");
  });

  it("interrupts a live game when the reader errors", () => {
    const current = host({ stage: "playing" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleErrorReply(data: {
          type: "error";
          id: number;
          message: string;
        }): void;
      }
    ).handleErrorReply({ type: "error", id: 2, message: "Blurry." });
    expect(current.onPlaybackInterrupted).toHaveBeenCalledWith("Blurry.");
  });

  it("surfaces a reader error as a notice off the board", () => {
    const current = host({ stage: "idle" });
    const feed = new CameraFeedStore(current);
    (
      feed as unknown as {
        handleErrorReply(data: {
          type: "error";
          id: number;
          message: string;
        }): void;
      }
    ).handleErrorReply({ type: "error", id: 3, message: "" });
    expect(current.onFeedNotice).toHaveBeenCalledWith(
      "The page could not be read. Check the lighting and frame it again.",
    );
  });

  it("keeps a finished video flag off for the camera", () => {
    const current = host({ source: "camera" });
    const feed = new CameraFeedStore(current);
    feed.video = { ended: true } as HTMLVideoElement;
    expect(feed.videoEnded).toBe(false);
  });

  it("does not treat a moving frame as ready", () => {
    const feed = new CameraFeedStore(host());
    feed.observation = observation(".........", 10, [], { quality: "moving" });
    expect(feed.hasReadyFrame()).toBe(false);
  });

  it("records a found board and asks again when none is found", () => {
    const current = host({ stage: "detecting" });
    const feed = new CameraFeedStore(current);
    const handle = feed as unknown as {
      handleDetectReply(data: {
        type: "detected";
        id: number;
        corners: { x: number; y: number }[] | null;
        board: ("X" | "O" | null)[];
      }): void;
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
        handleDetectReply(data: {
          type: "detected";
          id: number;
          corners: { x: number; y: number }[];
          board: ("X" | "O" | null)[];
        }): void;
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
});
