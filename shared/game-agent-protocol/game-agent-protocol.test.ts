import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { isGameAgentReply } from "./game-agent-protocol";
import { isUuid } from "./game-agent-protocol";
import { gameAgentReply } from "../../tests/helpers/game-agent-fixtures.ts";

const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("isUuid", () => {
  it("accepts lowercase hyphenated ids only", () => {
    expect(isUuid(REQUEST_ID)).toBe(true);
    expect(isUuid(REQUEST_ID.toUpperCase())).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(1)).toBe(false);
  });
});

describe("isGameAgentReply", () => {
  it("accepts a full reply and rejects a thin object", () => {
    expect(isGameAgentReply(gameAgentReply())).toBe(true);
    expect(isGameAgentReply({ error: "Invalid session." })).toBe(false);
    expect(isGameAgentReply({ sessionId: REQUEST_ID, revision: 0 })).toBe(false);
  });
});
