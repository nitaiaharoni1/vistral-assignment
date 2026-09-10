import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze, model, PROMPT_VERSION } from "./analyze";
import { analysis, marks } from "../../../tests/helpers/boards.ts";

function completion(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "or-1",
      choices: [{ message: { content } }],
      usage: { cost: 0.002 },
      ...extra,
    }),
  };
}

describe("analyze", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the board, pending move, and up to two examples", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion(JSON.stringify(analysis("....X...."))));
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
    const result = await analyze(
      "data:image/jpeg;base64,/9j/NOW",
      marks("....X...."),
      0,
      examples,
    );
    expect(result.analysis.cells[4].mark).toBe("X");
    expect(result.costUsd).toBe(0.002);
    expect(result.providerRequestId).toBe("or-1");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(model);
    expect(body.provider.data_collection).toBe("deny");
    const user = body.messages[1].content;
    expect(
      user.filter((part: { type: string }) => part.type === "image_url"),
    ).toHaveLength(3);
    expect(user[0].text).toMatch(/Actual cells/);
    expect(user.at(-2).text).toMatch(/intended O cell: 0/);
    expect(PROMPT_VERSION).toBe("paper-board-v2");
    expect(body.messages[0].content).toMatch(/only read the board/);
  });

  it("uses the reservation cost when the provider omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          completion(JSON.stringify(analysis(".........")), { usage: {} }),
        ),
    );
    const result = await analyze("img", marks("........."), null, []);
    expect(result.costUsd).toBe(0.015);
  });

  it("explains 401 and 402, and hides other provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    await expect(analyze("img", marks("........."), null, [])).rejects.toThrow(
      /key was not accepted/,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 402 }),
    );
    await expect(analyze("img", marks("........."), null, [])).rejects.toThrow(
      /credit limit/,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(analyze("img", marks("........."), null, [])).rejects.toThrow(
      /temporarily unavailable/,
    );
  });

  it("rejects a missing or invalid model payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(null)));
    await expect(analyze("img", marks("........."), null, [])).rejects.toThrow(
      /no usable answer/,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(completion(JSON.stringify({ nope: true }))),
    );
    await expect(analyze("img", marks("........."), null, [])).rejects.toThrow(
      /Invalid model response/,
    );
  });
});
