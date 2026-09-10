import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { FrameReader } from "./frame-reader.helpers";

class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  terminated = false;
  private listeners = new Map<string, EventListener[]>();

  // Stores a listener so tests can emit events.
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const handler = typeof listener === "function" ? listener : listener.handleEvent.bind(listener);
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
    super.addEventListener(type, listener);
  }

  // Drops a stored listener.
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const handler = typeof listener === "function" ? listener : listener.handleEvent.bind(listener);
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== handler),
    );
    super.removeEventListener(type, listener);
  }

  // Records a posted worker message.
  postMessage(message: unknown) {
    this.posted.push(message);
  }

  // Marks the fake worker as terminated.
  terminate() {
    this.terminated = true;
  }

  // Delivers an event to stored listeners.
  emit(type: string, data?: unknown) {
    const event = { currentTarget: this, data } as unknown as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

let created: FakeWorker | undefined;

// Remembers the last created fake worker.
function remember(worker: FakeWorker) {
  created = worker;
}

// Builds a tiny test image.
function frame() {
  return { data: new Uint8ClampedArray(16), width: 2, height: 2 } as ImageData;
}

// Throws when a worker cannot be created.
function failWorker() {
  throw new Error("no worker");
}

// Emits an event from a fake worker.
function deliver(worker: FakeWorker, type: string, data?: unknown) {
  worker.emit(type, data);
}

describe("FrameReader", () => {
  afterEach(() => {
    created = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Installs a fake Worker that records the instance.
  function stubWorker() {
    created = undefined;
    vi.stubGlobal(
      "Worker",
      class extends FakeWorker {
        // Remembers this fake worker instance.
        constructor() {
          super();
          remember(this);
        }
      },
    );
  }

  // Starts a FrameReader against the fake worker.
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
    const id = (worker.posted[0] as { id: number }).id;
    deliver(worker, "message", { type: "error", id: id + 10, message: "old" });
    expect(onReply).not.toHaveBeenCalled();
    deliver(worker, "message", { type: "detected", id, corners: null });
    expect(onReply).toHaveBeenCalledOnce();
    expect(reader.busy).toBe(false);
  });

  it("fails when the worker errors or returns junk", () => {
    const first = start();
    deliver(first.worker, "error");
    expect(first.onFailure.mock.calls[0][0]).toMatch(/reader stopped/);
    const second = start();
    deliver(second.worker, "messageerror");
    expect(second.onFailure.mock.calls[0][0]).toMatch(/unreadable response/);
  });
});
