import { afterEach } from "vitest";
import { beforeEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { analysis } from "../../tests/helpers/boards.ts";
import { marks } from "../../tests/helpers/boards.ts";
import { GAME_AGENT_API_BASE } from "../../shared/game-agent-protocol/game-agent-protocol";
import type * as GameAgentAnalyzeModule from "./game-agent/services/game-agent-analyze/game-agent-analyze.service.ts";

const { analyzeMock } = vi.hoisted(() => ({ analyzeMock: vi.fn() }));

vi.mock("./game-agent/services/game-agent-analyze/game-agent-analyze.service.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof GameAgentAnalyzeModule;
  const { Injectable } = await import("@nestjs/common");
  @Injectable()
  class GameAgentAnalyzeService {
    readonly model = actual.model;
    readonly promptVersion = actual.PROMPT_VERSION;
    analyze = analyzeMock;
  }
  return { ...actual, GameAgentAnalyzeService };
});

import { model } from "./game-agent/services/game-agent-analyze/game-agent-analyze.service";
import { MAX_SESSIONS_PER_WINDOW } from "./game-agent/services/game-agent/game-agent.service";
import { resetAnalyzeGate } from "./game-agent/services/game-agent/game-agent.service";
import { bindGameAgent } from "./main";
import { createGameAgentApp } from "./main";
import { listenGameAgent } from "./main";
import { resetSessionCreations } from "./main";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROFILE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// Binds the app to a free local port.
async function listen(app: INestApplication) {
  const server = await bindGameAgent(app, 0);
  return (server.address() as AddressInfo).port;
}

// Sends an HTTP request and returns status plus JSON.
async function call(port: number, path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  return { status: response.status, body: await response.json() };
}

// Builds a JSON POST RequestInit.
function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  } satisfies RequestInit;
}

describe("agent HTTP routes", () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    resetAnalyzeGate();
    resetSessionCreations();
  });

  afterEach(async () => {
    process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";
    if (!app) return;
    await app.close();
    app = undefined;
  });

  // Creates the app and listens on a free port.
  async function start() {
    app = await createGameAgentApp();
    return listen(app);
  }

  it("reports whether a key is configured", async () => {
    const port = await start();
    const ok = await call(port, `${GAME_AGENT_API_BASE}/status`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ configured: true, model });
  });

  it("rejects unknown methods, foreign origins, and a missing key", async () => {
    const port = await start();
    expect((await call(port, `${GAME_AGENT_API_BASE}/sessions`, { method: "POST" })).status).toBe(404);
    expect((await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}, { Origin: "https://evil.example" }))).status).toBe(403);
    delete process.env.OPENROUTER_API_KEY;
    expect((await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}))).status).toBe(503);
  });

  it("creates a session, syncs it, and analyzes a snapshot", async () => {
    analyzeMock.mockResolvedValue({
      analysis: analysis("....X...."),
      latencyMs: 9,
      costUsd: 0.01,
      providerRequestId: "or-http",
    });
    const port = await start();
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({ profile: PROFILE }));
    expect(created.status).toBe(200);
    const sessionId = created.body.sessionId as string;
    const synced = await call(port, `${GAME_AGENT_API_BASE}/sync`, json({ sessionId, revision: 0 }));
    expect(synced.body.revision).toBe(0);
    const analyzed = await call(
      port,
      `${GAME_AGENT_API_BASE}/analyze`,
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
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
    const sessionId = created.body.sessionId as string;
    await call(port, `${GAME_AGENT_API_BASE}/analyze`, json({ sessionId, revision: 0, requestId: REQUEST_ID, image: JPEG }));
    const corrected = await call(port, `${GAME_AGENT_API_BASE}/feedback`, json({ sessionId, revision: 1, board: marks("....X....") }));
    expect(corrected.status).toBe(200);
    expect(corrected.body.decisionSource).toBe("rules");
  });

  it("returns 400 for an invalid session or board", async () => {
    const port = await start();
    const badSession = await call(port, `${GAME_AGENT_API_BASE}/sync`, json({ sessionId: "nope", revision: 0 }));
    expect(badSession.status).toBe(400);
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
    const badBoard = await call(
      port,
      `${GAME_AGENT_API_BASE}/feedback`,
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
    expect((await call(port, `${GAME_AGENT_API_BASE}/other`)).status).toBe(404);
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
    const missing = await call(port, `${GAME_AGENT_API_BASE}/other`, json({ sessionId: created.body.sessionId, revision: 0 }));
    expect(missing.status).toBe(404);
  });

  it("reports an unconfigured key and keeps json cache headers", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const port = await start();
    const response = await fetch(`http://127.0.0.1:${port}${GAME_AGENT_API_BASE}/status`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.json()).toEqual({ configured: false, model });
  });

  it("rejects one more new session than the hourly cap", async () => {
    const port = await start();
    await Array.from({ length: MAX_SESSIONS_PER_WINDOW }, () => port).reduce(async (done, next) => {
      await done;
      expect((await call(next, `${GAME_AGENT_API_BASE}/sessions`, json({}))).status).toBe(200);
    }, Promise.resolve());
    const blocked = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
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
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
    const sessionId = created.body.sessionId as string;
    const badImage = await call(
      port,
      `${GAME_AGENT_API_BASE}/analyze`,
      json({
        sessionId,
        revision: 0,
        requestId: REQUEST_ID,
        image: "data:image/png;base64,xx",
      }),
    );
    expect(badImage.status).toBe(400);
    expect(badImage.body.error).toMatch(/JPEG snapshot/);
    const missingId = await call(port, `${GAME_AGENT_API_BASE}/analyze`, json({ sessionId, revision: 0, image: JPEG }));
    expect(missingId.status).toBe(400);
    expect(missingId.body.error).toMatch(/Invalid request/);
    expect(missingId.body.error).not.toMatch(/JPEG/);
    const broken = await fetch(`http://127.0.0.1:${port}${GAME_AGENT_API_BASE}/sessions`, {
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
    const created = await call(port, `${GAME_AGENT_API_BASE}/sessions`, json({}));
    const sessionId = created.body.sessionId as string;
    const early = await call(port, `${GAME_AGENT_API_BASE}/feedback`, json({ sessionId, revision: 0, board: marks("....X....") }));
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/Check the board first/);
    const analyzed = await call(
      port,
      `${GAME_AGENT_API_BASE}/analyze`,
      json({
        sessionId,
        revision: 0,
        requestId: REQUEST_ID,
        image: JPEG,
        trigger: "automatic",
      }),
    );
    const events = (analyzed.body.session as { events: { message: string }[] }).events;
    expect(events.at(-1)?.message).toMatch(/trigger: automatic/);
  });

  it("rejects a well-formed session id that is not on the server", async () => {
    const port = await start();
    const missing = await call(
      port,
      `${GAME_AGENT_API_BASE}/sync`,
      json({
        sessionId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        revision: 0,
      }),
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/expired/);
  });
});

describe("listenGameAgent", () => {
  it("binds a local port and can be closed", async () => {
    const previous = process.env.AGENT_PORT;
    process.env.AGENT_PORT = "0";
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    let nest: INestApplication | undefined;
    try {
      nest = await listenGameAgent();
      const port = (nest.getHttpServer().address() as AddressInfo).port;
      expect(port).toBeGreaterThan(0);
      expect(write.mock.calls[0]?.[0]).toBe(`Paperplay agent listening on 127.0.0.1:${port}\n`);
    } finally {
      write.mockRestore();
      await nest?.close();
      if (previous === undefined) delete process.env.AGENT_PORT;
      else process.env.AGENT_PORT = previous;
    }
  });
});
