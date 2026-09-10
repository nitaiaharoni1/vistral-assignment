import { Readable } from "node:stream";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { clientError } from "./http";
import { jsonHeaders } from "./http";
import { MAX_BODY_BYTES } from "./http";
import { readGameAgentBody } from "./http";
import { readJson } from "./http";
import { sameOrigin } from "./http";
import { send } from "./http";
import { GAME_AGENT_API_BASE } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import type { IncomingMessage } from "node:http";
import type { ServerResponse } from "node:http";

// Builds a fake request with the given headers.
function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

// Builds a readable request from a string body.
function body(value: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(value)]) as IncomingMessage;
  stream.headers = {};
  return stream;
}

describe("sameOrigin", () => {
  it("allows requests with no Origin header", () => {
    expect(sameOrigin(request({}))).toBe(true);
  });

  it("allows a matching Host or forwarded host", () => {
    expect(sameOrigin(request({ origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" }))).toBe(true);
    expect(
      sameOrigin(
        request({
          origin: "http://127.0.0.1:5173",
          "x-forwarded-host": "127.0.0.1:5173",
          host: "other",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a foreign Origin", () => {
    expect(sameOrigin(request({ origin: "https://evil.example", host: "127.0.0.1:5173" }))).toBe(false);
  });
});

describe("readJson", () => {
  it("parses a JSON object", async () => {
    await expect(readJson(body('{"ok":true}'))).resolves.toEqual({ ok: true });
  });

  it("rejects arrays, non-objects, and oversized bodies", async () => {
    await expect(readJson(body("[]"))).rejects.toThrow(/Invalid request/);
    await expect(readJson(body("1"))).rejects.toThrow(/Invalid request/);
    await expect(readJson(body("{"))).rejects.toThrow(SyntaxError);
    const huge = body("x".repeat(MAX_BODY_BYTES + 1));
    await expect(readJson(huge)).rejects.toThrow(/too large/);
  });
});

describe("send", () => {
  it("writes json with no-store headers", () => {
    const headers: Record<string, string> = {};
    let written = "";
    const res = {
      writeHead(status: number, next: Record<string, string>) {
        expect(status).toBe(200);
        Object.assign(headers, next);
      },
      end(value: string) {
        written = value;
      },
    };
    send(res as ServerResponse, 200, { ok: true });
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(written).toBe('{"ok":true}');
  });
});

describe("clientError", () => {
  it("keeps Error text and hides broken json", () => {
    expect(clientError(new Error("Invalid session."))).toBe("Invalid session.");
    expect(clientError(new SyntaxError("Unexpected token"))).toMatch(/invalid response/);
    expect(clientError("nope")).toMatch(/invalid response/);
  });
});

describe("jsonHeaders", () => {
  it("sets cache headers and continues", () => {
    const headers: Record<string, string> = {};
    let continued = false;
    jsonHeaders(
      request({}),
      {
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
      } as ServerResponse,
      () => {
        continued = true;
      },
    );
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(continued).toBe(true);
  });
});

describe("readGameAgentBody", () => {
  it("lets the status route through and rejects a non-json post", async () => {
    let statusNext = false;
    readGameAgentBody(
      {
        method: "GET",
        url: `${GAME_AGENT_API_BASE}/status`,
        headers: {},
      } as IncomingMessage,
      {} as ServerResponse,
      () => {
        statusNext = true;
      },
    );
    expect(statusNext).toBe(true);
    const blocked = reply();
    readGameAgentBody(
      {
        method: "POST",
        url: `${GAME_AGENT_API_BASE}/sessions`,
        headers: {},
      } as IncomingMessage,
      blocked.res,
      () => {
        throw new Error("should not continue");
      },
    );
    expect(blocked.status).toBe(404);
  });

  it("parses a json object and reports broken json", async () => {
    const parsed = body('{"ok":true}') as IncomingMessage & {
      body?: Record<string, unknown>;
    };
    parsed.method = "POST";
    parsed.headers = { "content-type": "application/json" };
    await new Promise<void>((resolve, reject) => {
      readGameAgentBody(parsed, {} as ServerResponse, (error) => (error ? reject(error) : resolve()));
    });
    expect(parsed.body).toEqual({ ok: true });
    const broken = body("{") as IncomingMessage;
    broken.method = "POST";
    broken.headers = { "content-type": "application/json" };
    const failed = await new Promise<{ status: number; written: string }>((resolve) => {
      const next = reply(resolve);
      readGameAgentBody(broken, next.res, () => {
        throw new Error("should not continue");
      });
    });
    expect(failed.status).toBe(400);
    expect(failed.written).toMatch(/invalid response/);
  });
});

// Builds a fake response that records status and body.
function reply(done?: (state: { status: number; written: string }) => void) {
  const state = { status: 0, written: "", res: {} as ServerResponse };
  state.res = {
    headersSent: false,
    writeHead(status: number) {
      state.status = status;
    },
    end(value: string) {
      state.written = value;
      done?.(state);
    },
  } as ServerResponse;
  return state;
}
