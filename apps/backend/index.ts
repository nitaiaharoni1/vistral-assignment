import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, correctReading, gameFor, readBoard } from "./agent/agent";
import { isBoard } from "../../shared/agent-protocol";
import { model } from "./agent/analyze";
import { persist } from "./storage/storage";
import {
  isUuid,
  readJson,
  sameOrigin,
  send,
  validateSnapshot,
} from "./http/http";
import { withinWindow } from "./http/rate-limit";

const SESSION_WINDOW_MS = 3600000;
const MAX_SESSIONS_PER_WINDOW = 30;
const creations: number[] = [];

export function resetSessionCreations() {
  creations.length = 0;
}

async function newSession(input: Record<string, unknown>, res: ServerResponse) {
  const now = Date.now();
  if (!withinWindow(creations, now, SESSION_WINDOW_MS, MAX_SESSIONS_PER_WINDOW))
    return send(res, 429, { error: "Too many new games. Try later." });
  creations.push(now);
  const profile = isUuid(input.profile) ? input.profile : randomUUID();
  const reply = createGame(profile);
  await persist();
  return send(res, 200, reply);
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = req.url?.split("?")[0];
  if (req.method === "GET" && path === "/api/agent/status")
    return send(res, 200, {
      configured: !!process.env.OPENROUTER_API_KEY,
      model,
    });
  if (
    req.method !== "POST" ||
    !req.headers["content-type"]?.startsWith("application/json")
  )
    return send(res, 404, { error: "Not found" });
  if (!sameOrigin(req))
    return send(res, 403, { error: "Use the app to check your board." });
  if (!process.env.OPENROUTER_API_KEY)
    return send(res, 503, { error: "The board reader is not configured yet." });
  const input = await readJson(req);
  if (path === "/api/agent/sessions") return newSession(input, res);
  return sessionRequest(path, input, res);
}

function triggerOf(
  input: Record<string, unknown>,
): "automatic" | "manual" | "unspecified" {
  return input.trigger === "automatic" || input.trigger === "manual"
    ? input.trigger
    : "unspecified";
}

async function analyzeRoute(
  sessionId: string,
  input: Record<string, unknown>,
  res: ServerResponse,
) {
  validateSnapshot(input);
  return send(
    res,
    200,
    await readBoard(
      sessionId,
      Number(input.revision),
      input.requestId,
      input.image,
      triggerOf(input),
    ),
  );
}

async function feedbackRoute(
  sessionId: string,
  input: Record<string, unknown>,
  res: ServerResponse,
) {
  if (!isBoard(input.board))
    throw new Error("Choose X, O, or empty for every square.");
  return send(
    res,
    200,
    await correctReading(sessionId, Number(input.revision), input.board),
  );
}

async function sessionRequest(
  path: string | undefined,
  input: Record<string, unknown>,
  res: ServerResponse,
) {
  if (!isUuid(input.sessionId) || !Number.isInteger(input.revision))
    throw new Error("Invalid session.");
  const game = gameFor(input.sessionId);
  if (path === "/api/agent/sync") return send(res, 200, game.reply);
  if (path === "/api/agent/analyze")
    return analyzeRoute(input.sessionId, input, res);
  if (path === "/api/agent/feedback")
    return feedbackRoute(input.sessionId, input, res);
  return send(res, 404, { error: "Not found" });
}

export function createAgentServer() {
  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      const message =
        error instanceof Error && !(error instanceof SyntaxError)
          ? error.message
          : "The board reader returned an invalid response. Try again.";
      if (!res.headersSent) send(res, 400, { error: message });
    });
  });
  server.requestTimeout = 30000;
  return server;
}

export function listenAgent(server = createAgentServer()) {
  const port = Number(process.env.AGENT_PORT || 4174);
  server.listen(port, "127.0.0.1", () =>
    process.stdout.write(`Paperplay agent listening on 127.0.0.1:${port}\n`),
  );
  return server;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) listenAgent();
