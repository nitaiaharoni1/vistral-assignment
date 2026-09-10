import { Inject } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { StorageService } from "../../../common/storage/storage.service";
import type { Board } from "../../../../../shared/types";
import type { GameAgentReply } from "../../../../../shared/game-agent-protocol/game-agent-protocol";
import type { CaptureFeedback } from "../../../../../shared/game-agent-protocol/game-agent-protocol";

export type Example = { image: string; board: Board; at: string };
export type SavedGame = {
  reply: GameAgentReply;
  profile: string;
  initialized: boolean;
  calls: number;
  lastCallAt: number;
  lastImage: string | null;
  lastRequestId: string | null;
  captureKey?: string;
  updatedAt?: number;
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

const AGENT_STATE_FILE = "agent-state.json";
const GAME_TTL_MS = 2 * 60 * 60 * 1000;
const FINISHED_IMAGE_TTL_MS = 30 * 60 * 1000;

export const state: State = await new StorageService().load(AGENT_STATE_FILE, {
  spent: 0,
  games: {},
  examples: {},
});
for (const game of Object.values(state.games)) {
  Reflect.deleteProperty(game, "finalCandidate");
  Reflect.deleteProperty(game.reply, "verifyAgain");
  Reflect.deleteProperty(game.reply, "awaitingEmptyBoard");
  game.updatedAt ??= Date.now();
}

@Injectable()
export class GameAgentStorageService {
  public readonly state = state;

  // Stores the file-backed storage service.
  constructor(@Inject(StorageService) private readonly files: StorageService) {}

  // Saves the in-memory agent state to disk.
  public persist() {
    this.pruneGames();
    return this.files.persist(AGENT_STATE_FILE, this.state);
  }

  // Removes expired sessions and old correction images before writing.
  public pruneGames() {
    const now = Date.now();
    for (const [sessionId, game] of Object.entries(this.state.games)) {
      const age = now - (game.updatedAt ?? now);
      if (age > GAME_TTL_MS) {
        delete this.state.games[sessionId];
      } else if (game.reply.session.phase === "finished" && age > FINISHED_IMAGE_TTL_MS) {
        game.lastImage = null;
      }
    }
  }
}
