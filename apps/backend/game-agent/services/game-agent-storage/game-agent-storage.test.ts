import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe } from "vitest";
import { expect } from "vitest";
import { it } from "vitest";
import { StorageService } from "../../../common/storage/storage.service";
import { GameAgentStorageService } from "./game-agent-storage.service";
import { state } from "./game-agent-storage.service";
import { createSession } from "../../../../../shared/session-helpers/session.helpers";
import { gameAgentReply } from "../../../../../tests/helpers/game-agent-fixtures.ts";

// Builds a GameAgentStorageService for tests.
function storage() {
  return new GameAgentStorageService(new StorageService());
}

describe("GameAgentStorageService", () => {
  it("writes the in-memory state to the isolated paperplay directory", async () => {
    state.spent = 0.42;
    state.games.demo = {
      reply: gameAgentReply({ session: createSession() }),
      profile: "p",
      initialized: false,
      calls: 2,
      lastCallAt: 1,
      lastImage: null,
      lastRequestId: null,
    };
    await storage().persist();
    const saved = JSON.parse(await readFile(join(process.env.PAPERPLAY_DIR!, "agent-state.json"), "utf8"));
    expect(saved.spent).toBe(0.42);
    expect(saved.games.demo.calls).toBe(2);
  });

  it("serializes overlapping writes so the last state wins", async () => {
    const files = storage();
    state.spent = 1;
    const first = files.persist();
    state.spent = 2;
    await Promise.all([first, files.persist()]);
    const saved = JSON.parse(await readFile(join(process.env.PAPERPLAY_DIR!, "agent-state.json"), "utf8"));
    expect(saved.spent).toBe(2);
  });
});
