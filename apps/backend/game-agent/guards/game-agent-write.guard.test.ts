import { HttpException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { GameAgentWriteGuard } from "./game-agent-write.guard";

// Builds a fake ExecutionContext around a request.
function context(req: Partial<IncomingMessage>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe("GameAgentWriteGuard", () => {
  const previous = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });

  it("lets reads through", () => {
    expect(new GameAgentWriteGuard().canActivate(context({ method: "GET" }))).toBe(true);
  });

  it("blocks a foreign origin and a missing key", () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    expect(() =>
      new GameAgentWriteGuard().canActivate(
        context({
          method: "POST",
          headers: { origin: "https://evil.example", host: "127.0.0.1:4174" },
        }),
      ),
    ).toThrow(HttpException);
    delete process.env.OPENROUTER_API_KEY;
    expect(() => new GameAgentWriteGuard().canActivate(context({ method: "POST", headers: {} }))).toThrow(HttpException);
  });

  it("allows a same-origin write when a key is set", () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    expect(new GameAgentWriteGuard().canActivate(context({ method: "POST", headers: {} }))).toBe(true);
  });
});
