import type { WorkerMessage } from "../../../types";
import type { WorkerReply } from "../../../types";
import type { WorkerRequest } from "../../../types";

const WORKER_TIMEOUT_MS = 5000;

export class FrameReader {
  private worker: Worker | null = null;
  private requestId = 0;
  private timeout: number | null = null;

  // Stores reply and failure callbacks.
  constructor(
    private readonly onReply: (reply: WorkerReply) => void,
    private readonly onFailure: (message: string) => void,
  ) {}

  // True while a worker request is in flight.
  get busy() {
    return this.timeout !== null;
  }

  // Starts the board-reader worker.
  start() {
    this.dispose();
    try {
      this.worker = new Worker(new URL("../workers/board-reader.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      this.onFailure("This browser could not start the reader. Try a current browser, then start a new session.");
      return false;
    }
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onError);
    this.worker.addEventListener("messageerror", this.onMessageError);
    return true;
  }

  // Sends one frame request to the worker.
  send(request: WorkerRequest) {
    const worker = this.worker;
    if (!worker || this.busy) return;
    const id = ++this.requestId;
    this.timeout = window.setTimeout(() => {
      if (worker !== this.worker || id !== this.requestId) return;
      this.fail("The reader stopped responding. Your confirmed moves remain in move history. Start a new session to reload the reader.");
    }, WORKER_TIMEOUT_MS);
    try {
      worker.postMessage({ ...request, id } satisfies WorkerMessage, [request.image.data.buffer]);
    } catch {
      this.fail("The reader could not receive the frame. Start a new session to reload it.");
    }
  }

  // Cancels the in-flight worker request.
  cancel() {
    if (this.timeout !== null) window.clearTimeout(this.timeout);
    this.timeout = null;
    this.requestId++;
  }

  // Stops and discards the worker.
  dispose() {
    this.cancel();
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.removeEventListener("message", this.onMessage);
    worker.removeEventListener("error", this.onError);
    worker.removeEventListener("messageerror", this.onMessageError);
    worker.terminate();
  }

  // Stops the worker and reports a failure.
  private fail(message: string) {
    this.dispose();
    this.onFailure(message);
  }

  // Delivers a matching worker reply.
  private onMessage = (event: MessageEvent<WorkerReply>) => {
    if (event.currentTarget !== this.worker || event.data.id !== this.requestId) return;
    this.cancel();
    this.onReply(event.data);
  };

  // Fails when the worker stops.
  private onError = (event: ErrorEvent) => {
    if (event.currentTarget !== this.worker) return;
    this.fail("The camera reader stopped. Start a new session to reload it.");
  };

  // Fails when the worker returns junk.
  private onMessageError = (event: MessageEvent) => {
    if (event.currentTarget !== this.worker) return;
    this.fail("The reader returned an unreadable response. Start a new session to reload it.");
  };
}
