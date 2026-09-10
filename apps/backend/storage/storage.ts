import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Board } from "../../../shared/types";
import type {
  AgentReply,
  CaptureFeedback,
} from "../../../shared/agent-protocol";

export type Example = { image: string; board: Board; at: string };
export type SavedGame = {
  reply: AgentReply;
  profile: string;
  initialized: boolean;
  calls: number;
  lastCallAt: number;
  lastImage: string | null;
  lastRequestId: string | null;
  captureKey?: string;
};
export type CaptureMemory = {
  version: number;
  stableMs: number;
  completedGames: number;
  lastSessionId: string;
  lastResult: CaptureFeedback;
};
type State = {
  spent: number;
  games: Record<string, SavedGame>;
  examples: Record<string, Example[]>;
  captureProfiles?: Record<string, CaptureMemory>;
};
const directory = resolve(process.env.PAPERPLAY_DIR || ".paperplay");
const filename = resolve(directory, "agent-state.json");
export const state: State = await readFile(filename, "utf8")
  .then(JSON.parse)
  .catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return { spent: 0, games: {}, examples: {} };
  });
for (const game of Object.values(state.games)) {
  Reflect.deleteProperty(game, "finalCandidate");
  Reflect.deleteProperty(game.reply, "verifyAgain");
  Reflect.deleteProperty(game.reply, "awaitingEmptyBoard");
}
let writes = Promise.resolve();
export function persist(): Promise<void> {
  const json = JSON.stringify(state);
  writes = writes
    .catch(() => {})
    .then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(filename + ".tmp", json, { mode: 0o600 });
      await rename(filename + ".tmp", filename);
    });
  return writes;
}
