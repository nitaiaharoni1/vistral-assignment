import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { analysis, marks } from "../../tests/helpers/boards.ts";
import type * as AnalyzeModule from "./agent/analyze.ts";

vi.mock("./agent/analyze.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AnalyzeModule;
  return { ...actual, analyze: vi.fn() };
});

import { analyze, model } from "./agent/analyze";
import { createAgentServer, resetSessionCreations } from "./index";
import { resetAnalyzeGate } from "./agent/agent";

const analyzeMock = vi.mocked(analyze);
const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROFILE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function listen(server: Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function call(
  port: number,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  return { status: response.status, body: await response.json() };
}

function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  } satisfies RequestInit;
}

describe("agent HTTP routes", () => {
  let server: Server | undefined;

  beforeEach(() => {
    resetAnalyzeGate();
    resetSessionCreations();
  });

  afterEach(async () => {
    process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  async function start() {
    server = createAgentServer();
    return listen(server);
  }

  it("reports whether a key is configured", async () => {
    const port = await start();
    const ok = await call(port, "/api/agent/status");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ configured: true, model });
  });

  it("rejects unknown methods, foreign origins, and a missing key", async () => {
    const port = await start();
    expect(
      (await call(port, "/api/agent/sessions", { method: "POST" })).status,
    ).toBe(404);
    expect(
      (
        await call(
          port,
          "/api/agent/sessions",
          json({}, { Origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    delete process.env.OPENROUTER_API_KEY;
    expect((await call(port, "/api/agent/sessions", json({}))).status).toBe(
      503,
    );
  });

  it("creates a session, syncs it, and analyzes a snapshot", async () => {
    analyzeMock.mockResolvedValue({
      analysis: analysis("....X...."),
      latencyMs: 9,
      costUsd: 0.01,
      providerRequestId: "or-http",
    });
    const port = await start();
    const created = await call(
      port,
      "/api/agent/sessions",
      json({ profile: PROFILE }),
    );
    expect(created.status).toBe(200);
    const sessionId = created.body.sessionId as string;
    const synced = await call(
      port,
      "/api/agent/sync",
      json({ sessionId, revision: 0 }),
    );
    expect(synced.body.revision).toBe(0);
    const analyzed = await call(
      port,
      "/api/agent/analyze",
      json({
        sessionId,
        revision: 0,
        requestId: REQUEST_ID,
        image: JPEG,
        trigger: "manual",
      }),
    );
    expect(analyzed.status).toBe(200);
    expect(analyzed.body.revision).toBe(1);
    expect(analyzed.body.status).toBe("ready");
  });

  it("saves a legal correction after a snapshot", async () => {
    analyzeMock.mockResolvedValue({
      analysis: analysis("........."),
      latencyMs: 4,
      costUsd: 0.01,
      providerRequestId: "or-http",
    });
    const port = await start();
    const created = await call(port, "/api/agent/sessions", json({}));
    const sessionId = created.body.sessionId as string;
    await call(
      port,
      "/api/agent/analyze",
      json({ sessionId, revision: 0, requestId: REQUEST_ID, image: JPEG }),
    );
    const corrected = await call(
      port,
      "/api/agent/feedback",
      json({ sessionId, revision: 1, board: marks("....X....") }),
    );
    expect(corrected.status).toBe(200);
    expect(corrected.body.decisionSource).toBe("rules");
  });

  it("returns 400 for an invalid session or board", async () => {
    const port = await start();
    const badSession = await call(
      port,
      "/api/agent/sync",
      json({ sessionId: "nope", revision: 0 }),
    );
    expect(badSession.status).toBe(400);
    const created = await call(port, "/api/agent/sessions", json({}));
    const badBoard = await call(
      port,
      "/api/agent/feedback",
      json({
        sessionId: created.body.sessionId,
        revision: 0,
        board: ["X"],
      }),
    );
    expect(badBoard.status).toBe(400);
    expect(badBoard.body.error).toMatch(/every square/);
  });

  it("returns 404 for an unknown route", async () => {
    const port = await start();
    expect((await call(port, "/api/agent/other")).status).toBe(404);
    const created = await call(port, "/api/agent/sessions", json({}));
    const missing = await call(
      port,
      "/api/agent/other",
      json({ sessionId: created.body.sessionId, revision: 0 }),
    );
    expect(missing.status).toBe(404);
  });

  it("reports an unconfigured key and keeps json cache headers", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const port = await start();
    const response = await fetch(`http://127.0.0.1:${port}/api/agent/status`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.json()).toEqual({ configured: false, model });
  });

  it("rejects a 31st new session in the same hour", async () => {
    const port = await start();
    await Array.from({ length: 30 }, () => port).reduce(async (done, next) => {
      await done;
      expect((await call(next, "/api/agent/sessions", json({}))).status).toBe(
        200,
      );
    }, Promise.resolve());
    const blocked = await call(port, "/api/agent/sessions", json({}));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many new games/);
  });

  it("rejects a bad snapshot, a missing request id, and broken json", async () => {
    analyzeMock.mockResolvedValue({
      analysis: analysis("........."),
      latencyMs: 4,
      costUsd: 0.01,
      providerRequestId: "or-http",
    });
    const port = await start();
    const created = await call(port, "/api/agent/sessions", json({}));
    const sessionId = created.body.sessionId as string;
    const badImage = await call(
      port,
      "/api/agent/analyze",
      json({
        sessionId,
        revision: 0,
        requestId: REQUEST_ID,
        image: "data:image/png;base64,xx",
      }),
    );
    expect(badImage.status).toBe(400);
    expect(badImage.body.error).toMatch(/JPEG snapshot/);
    const missingId = await call(
      port,
      "/api/agent/analyze",
      json({ sessionId, revision: 0, image: JPEG }),
    );
    expect(missingId.status).toBe(400);
    const broken = await fetch(`http://127.0.0.1:${port}/api/agent/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({
      error: "The board reader returned an invalid response. Try again.",
    });
  });

  it("records the analyze trigger and rejects feedback without a snapshot", async () => {
    analyzeMock.mockResolvedValue({
      analysis: analysis("....X...."),
      latencyMs: 6,
      costUsd: 0.01,
      providerRequestId: "or-http",
    });
    const port = await start();
    const created = await call(port, "/api/agent/sessions", json({}));
    const sessionId = created.body.sessionId as string;
    const early = await call(
      port,
      "/api/agent/feedback",
      json({ sessionId, revision: 0, board: marks("....X....") }),
    );
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/Check the board first/);
    const analyzed = await call(
      port,
      "/api/agent/analyze",
      json({
        sessionId,
        revision: 0,
        requestId: REQUEST_ID,
        image: JPEG,
        trigger: "automatic",
      }),
    );
    const events = (analyzed.body.session as { events: { message: string }[] })
      .events;
    expect(events.at(-1)?.message).toMatch(/trigger: automatic/);
  });

  it("rejects a well-formed session id that is not on the server", async () => {
    const port = await start();
    const missing = await call(
      port,
      "/api/agent/sync",
      json({
        sessionId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        revision: 0,
      }),
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/expired/);
  });
});
