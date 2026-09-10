import { createSession } from "../../shared/session.helpers";
import type { AgentReply } from "../../shared/agent-protocol";
import type { Session } from "../../shared/types";
import type { SavedGame } from "../../apps/backend/storage/storage.ts";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";

export function agentReply(overrides: Partial<AgentReply> = {}): AgentReply {
  return {
    sessionId: SESSION_ID,
    revision: 0,
    session: createSession(),
    analysis: null,
    status: "ready",
    message: "Hold the board still for a moment.",
    model: "test-model",
    decisionSource: "saved",
    latencyMs: 0,
    costUsd: 0,
    learnedExamples: 0,
    ...overrides,
  };
}

export function savedGame(overrides: Partial<SavedGame> = {}): SavedGame {
  return {
    profile: "22222222-2222-2222-2222-222222222222",
    initialized: false,
    calls: 0,
    lastCallAt: 0,
    lastImage: null,
    lastRequestId: null,
    reply: agentReply(),
    ...overrides,
  };
}

export function gameWithSession(
  session: Session,
  overrides: Partial<SavedGame> = {},
): SavedGame {
  return savedGame({
    initialized: true,
    ...overrides,
    reply: agentReply({ session, ...overrides.reply }),
  });
}
