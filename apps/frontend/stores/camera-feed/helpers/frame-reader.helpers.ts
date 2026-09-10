import type { WorkerMessage, WorkerReply, WorkerRequest } from "../../../types";

const WORKER_TIMEOUT_MS = 5000;

export class FrameReader {
  private worker: Worker | null = null;
  private requestId = 0;
  private timeout: number | null = null;

  constructor(
    private readonly onReply: (reply: WorkerReply) => void,
    private readonly onFailure: (message: string) => void,
  ) {}

  get busy() {
    return this.timeout !== null;
  }

  start() {
    this.dispose();
    try {
      this.worker = new Worker(
        new URL("../workers/board-reader.worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
    } catch {
      this.onFailure(
        "This browser could not start the reader. Try a current browser, then start a new session.",
      );
      return false;
    }
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onError);
    this.worker.addEventListener("messageerror", this.onMessageError);
    return true;
  }

  send(request: WorkerRequest) {
    const worker = this.worker;
    if (!worker || this.busy) return;
    const id = ++this.requestId;
    this.timeout = window.setTimeout(() => {
      if (worker !== this.worker || id !== this.requestId) return;
      this.fail(
        "The reader stopped responding. Your confirmed moves remain in move history. Start a new session to reload the reader.",
      );
    }, WORKER_TIMEOUT_MS);
    try {
      worker.postMessage({ ...request, id } satisfies WorkerMessage, [
        request.image.data.buffer,
      ]);
    } catch {
      this.fail(
        "The reader could not receive the frame. Start a new session to reload it.",
      );
    }
  }

  cancel() {
    if (this.timeout !== null) window.clearTimeout(this.timeout);
    this.timeout = null;
    this.requestId++;
  }

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

  private fail(message: string) {
    this.dispose();
    this.onFailure(message);
  }

  private onMessage = (event: MessageEvent<WorkerReply>) => {
    if (event.currentTarget !== this.worker || event.data.id !== this.requestId)
      return;
    this.cancel();
    this.onReply(event.data);
  };

  private onError = (event: ErrorEvent) => {
    if (event.currentTarget !== this.worker) return;
    this.fail("The camera reader stopped. Start a new session to reload it.");
  };

  private onMessageError = (event: MessageEvent) => {
    if (event.currentTarget !== this.worker) return;
    this.fail(
      "The reader returned an unreadable response. Start a new session to reload it.",
    );
  };
}
