import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { persist, state } from "./storage";
import { createSession } from "../../../shared/session.helpers";
import { agentReply } from "../../../tests/helpers/agent-fixtures.ts";

describe("persist", () => {
  it("writes the in-memory state to the isolated paperplay directory", async () => {
    state.spent = 0.42;
    state.games.demo = {
      reply: agentReply({ session: createSession() }),
      profile: "p",
      initialized: false,
      calls: 2,
      lastCallAt: 1,
      lastImage: null,
      lastRequestId: null,
    };
    await persist();
    const saved = JSON.parse(
      await readFile(
        join(process.env.PAPERPLAY_DIR!, "agent-state.json"),
        "utf8",
      ),
    );
    expect(saved.spent).toBe(0.42);
    expect(saved.games.demo.calls).toBe(2);
  });

  it("serializes overlapping writes so the last state wins", async () => {
    state.spent = 1;
    const first = persist();
    state.spent = 2;
    await Promise.all([first, persist()]);
    const saved = JSON.parse(
      await readFile(
        join(process.env.PAPERPLAY_DIR!, "agent-state.json"),
        "utf8",
      ),
    );
    expect(saved.spent).toBe(2);
  });
});
