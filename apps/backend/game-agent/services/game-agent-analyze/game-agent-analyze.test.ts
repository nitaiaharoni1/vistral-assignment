import { afterEach } from "vitest";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { vi } from "vitest";
import { GameAgentAnalyzeService } from "./game-agent-analyze.service";
import { model } from "./game-agent-analyze.service";
import { ModelUnavailableError } from "./game-agent-analyze.service";
import { PROMPT_VERSION } from "./game-agent-analyze.service";
import { analysis } from "../../../../../tests/helpers/boards.ts";
import { marks } from "../../../../../tests/helpers/boards.ts";

const analyzer = new GameAgentAnalyzeService();

// Builds a fake OpenRouter fetch response.
function completion(content: unknown, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "or-1",
      created: 1,
      model,
      object: "chat.completion",
      system_fingerprint: null,
      choices: [{ finish_reason: "stop", index: 0, message: { role: "assistant", content } }],
      usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2, cost: 0.002 },
      ...extra,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

// Builds a real failed response so the SDK can classify it.
function failure(status: number) {
  return new Response(JSON.stringify({ error: { code: status, message: `Provider returned ${status}` } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GameAgentAnalyzeService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the board, pending move, and up to two examples", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(JSON.stringify(analysis("....X...."))));
    vi.stubGlobal("fetch", fetchMock);
    const examples = [
      {
        image: "data:image/jpeg;base64,/9j/ONE",
        board: marks("X........"),
        at: "a",
      },
      {
        image: "data:image/jpeg;base64,/9j/TWO",
        board: marks("XO......."),
        at: "b",
      },
      {
        image: "data:image/jpeg;base64,/9j/THREE",
        board: marks("XOX......"),
        at: "c",
      },
    ];
    const result = await analyzer.analyze({
      image: "data:image/jpeg;base64,/9j/NOW",
      board: marks("....X...."),
      pendingMove: 0,
      examples,
    });
    expect(result.analysis.cells[4].mark).toBe("X");
    expect(result.costUsd).toBe(0.002);
    expect(result.providerRequestId).toBe("or-1");
    const request = fetchMock.mock.calls[0][0] as Request;
    const body = await request.clone().json();
    expect(body.model).toBe(model);
    expect(body.provider.data_collection).toBe("deny");
    expect(body.max_tokens).toBe(1400);
    expect(body).not.toHaveProperty("max_completion_tokens");
    const user = body.messages[1].content;
    expect(user.filter((part: { type: string }) => part.type === "image_url")).toHaveLength(3);
    expect(user[0].text).toMatch(/Actual cells/);
    expect(user.at(-2).text).toMatch(/intended O cell: 0/);
    expect(PROMPT_VERSION).toBe("paper-board-v3");
    expect(body.messages[0].content).toMatch(/only read the board/);
  });

  it("uses the reservation cost when the provider omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        completion(JSON.stringify(analysis(".........")), {
          usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
        }),
      ),
    );
    const result = await analyzer.analyze({
      image: "img",
      board: marks("........."),
      pendingMove: null,
      examples: [],
    });
    expect(result.costUsd).toBe(0.015);
  });

  it("explains 401 and 402, and hides other provider failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(401)));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/key was not accepted/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(402)));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/credit limit/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(500)));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/temporarily unavailable/);
  });

  it("rejects a missing or invalid model payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(null)));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/no usable answer/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(JSON.stringify({ nope: true }))));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/Invalid model response/);
  });

  it("reports an unreachable provider as unavailable and passes a timeout through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(
      analyzer.analyze({
        image: "img",
        board: marks("........."),
        pendingMove: null,
        examples: [],
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
