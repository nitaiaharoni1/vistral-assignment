import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameReader } from "./frame-reader.helpers";

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  terminated = false;

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

let created: FakeWorker | undefined;

function remember(worker: FakeWorker) {
  created = worker;
}

function frame() {
  return { data: new Uint8ClampedArray(16), width: 2, height: 2 } as ImageData;
}

function failWorker() {
  throw new Error("no worker");
}

describe("FrameReader", () => {
  afterEach(() => {
    created = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubWorker() {
    created = undefined;
    vi.stubGlobal(
      "Worker",
      class extends FakeWorker {
        constructor() {
          super();
          remember(this);
        }
      },
    );
  }

  function start() {
    stubWorker();
    const onReply = vi.fn();
    const onFailure = vi.fn();
    const reader = new FrameReader(onReply, onFailure);
    expect(reader.start()).toBe(true);
    expect(created).toBeInstanceOf(FakeWorker);
    return { reader, onReply, onFailure, worker: created! };
  }

  it("sends one frame at a time and can cancel that request", () => {
    const { reader, worker } = start();
    reader.send({ type: "detect", image: frame() });
    expect(reader.busy).toBe(true);
    reader.send({ type: "detect", image: frame() });
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({ type: "detect" });
    reader.cancel();
    expect(reader.busy).toBe(false);
    reader.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("fails when the worker is silent", () => {
    vi.useFakeTimers();
    const { reader, onFailure, worker } = start();
    reader.send({ type: "detect", image: frame() });
    vi.advanceTimersByTime(5000);
    expect(onFailure.mock.calls[0][0]).toMatch(/stopped responding/);
    expect(worker.terminated).toBe(true);
  });

  it("fails when the worker cannot be created", () => {
    vi.stubGlobal("Worker", failWorker);
    const onFailure = vi.fn();
    const reader = new FrameReader(vi.fn(), onFailure);
    expect(reader.start()).toBe(false);
    expect(onFailure.mock.calls[0][0]).toMatch(/could not start the reader/);
  });

  it("fails when the worker cannot receive a frame", () => {
    const { reader, onFailure, worker } = start();
    worker.postMessage = () => {
      throw new Error("closed");
    };
    reader.send({ type: "detect", image: frame() });
    expect(onFailure.mock.calls[0][0]).toMatch(/could not receive the frame/);
    expect(worker.terminated).toBe(true);
  });

  it("delivers a matching reply and ignores a stale one", () => {
    const { reader, onReply, worker } = start();
    reader.send({ type: "detect", image: frame() });
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "error", id: 99, message: "old" },
      }),
    );
    expect(onReply).not.toHaveBeenCalled();
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "detected", id: 1, corners: null },
      }),
    );
    expect(onReply).toHaveBeenCalledOnce();
    expect(reader.busy).toBe(false);
  });

  it("fails when the worker errors or returns junk", () => {
    const first = start();
    first.worker.dispatchEvent(new ErrorEvent("error"));
    expect(first.onFailure.mock.calls[0][0]).toMatch(/reader stopped/);
    const second = start();
    second.worker.dispatchEvent(new MessageEvent("messageerror"));
    expect(second.onFailure.mock.calls[0][0]).toMatch(/unreadable response/);
  });
});
