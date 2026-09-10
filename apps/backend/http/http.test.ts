import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  isUuid,
  MAX_BODY_BYTES,
  readJson,
  sameOrigin,
  send,
  validateSnapshot,
} from "./http";
import type { IncomingMessage, ServerResponse } from "node:http";

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

function body(value: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(value)]) as IncomingMessage;
  stream.headers = {};
  return stream;
}

describe("isUuid", () => {
  it("accepts lowercase hyphenated ids only", () => {
    expect(isUuid(REQUEST_ID)).toBe(true);
    expect(isUuid(REQUEST_ID.toUpperCase())).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(1)).toBe(false);
  });
});

describe("sameOrigin", () => {
  it("allows requests with no Origin header", () => {
    expect(sameOrigin(request({}))).toBe(true);
  });

  it("allows a matching Host or forwarded host", () => {
    expect(
      sameOrigin(
        request({ origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" }),
      ),
    ).toBe(true);
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
    expect(
      sameOrigin(
        request({ origin: "https://evil.example", host: "127.0.0.1:5173" }),
      ),
    ).toBe(false);
  });
});

describe("validateSnapshot", () => {
  it("accepts a JPEG data URL and a request id", () => {
    const input: Record<string, unknown> = {
      image: JPEG,
      requestId: REQUEST_ID,
    };
    expect(() => validateSnapshot(input)).not.toThrow();
  });

  it("rejects a missing image, a non-JPEG, or a bad request id", () => {
    expect(() =>
      validateSnapshot({
        image: "data:image/png;base64,xx",
        requestId: REQUEST_ID,
      }),
    ).toThrow(/JPEG snapshot/);
    expect(() => validateSnapshot({ image: JPEG, requestId: "nope" })).toThrow(
      /JPEG snapshot/,
    );
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
