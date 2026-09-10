import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

process.env.PAPERPLAY_DIR ??= mkdtempSync(join(tmpdir(), "paperplay-test-"));
process.env.AGENT_BUDGET_USD ??= "100";
process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";

const { state } = await import("../../apps/backend/storage/storage.ts");

beforeEach(() => {
  state.spent = 0;
  state.games = {};
  state.examples = {};
  state.captureProfiles = {};
});
