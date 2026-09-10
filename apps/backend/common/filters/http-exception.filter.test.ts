import { HttpException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

// Builds a fake ArgumentsHost around a response.
function host(res: Partial<ServerResponse>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
    }),
  } as ArgumentsHost;
}

// Builds a fake ServerResponse that records writes.
function response() {
  return {
    headersSent: false,
    writeHead: vi.fn(),
    end: vi.fn(),
  };
}

describe("HttpExceptionFilter", () => {
  it("leaves a response that already started", () => {
    const res = { headersSent: true, writeHead: vi.fn(), end: vi.fn() };
    new HttpExceptionFilter().catch(new Error("late"), host(res));
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it("maps http errors and plain failures", () => {
    const filter = new HttpExceptionFilter();
    const notFound = response();
    filter.catch(new HttpException("missing", 404), host(notFound));
    expect(notFound.writeHead).toHaveBeenCalledWith(404, expect.objectContaining({ "Content-Type": "application/json" }));
    expect(JSON.parse(notFound.end.mock.calls[0][0])).toEqual({
      error: "Not found",
    });

    const labeled = response();
    filter.catch(new HttpException({ error: "Use the app to check your board." }, 403), host(labeled));
    expect(JSON.parse(labeled.end.mock.calls[0][0])).toEqual({
      error: "Use the app to check your board.",
    });

    const text = response();
    filter.catch(new HttpException("busy", 429), host(text));
    expect(JSON.parse(text.end.mock.calls[0][0])).toEqual({ error: "busy" });

    const unknown = response();
    filter.catch(new HttpException({ reason: "nope" }, 400), host(unknown));
    expect(JSON.parse(unknown.end.mock.calls[0][0])).toEqual({
      error: "The board reader returned an invalid response. Try again.",
    });

    const plain = response();
    filter.catch(new Error("Choose X, O, or empty for every square."), host(plain));
    expect(JSON.parse(plain.end.mock.calls[0][0])).toEqual({
      error: "Choose X, O, or empty for every square.",
    });
  });
});
