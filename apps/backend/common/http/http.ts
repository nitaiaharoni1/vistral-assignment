import type { IncomingMessage } from "node:http";
import type { ServerResponse } from "node:http";
import { GAME_AGENT_API_BASE } from "../../../../shared/game-agent-protocol/game-agent-protocol";

export const MAX_BODY_BYTES = 850000;

type Next = (error?: unknown) => void;
type JsonRequest = IncomingMessage & { body?: Record<string, unknown> };

// Writes a JSON response with no-store headers.
export function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

// Returns a safe error string for the client.
export function clientError(error: unknown): string {
  return error instanceof Error && !(error instanceof SyntaxError) ? error.message : "The board reader returned an invalid response. Try again.";
}

// Sets cache headers and continues the request.
export function jsonHeaders(_req: IncomingMessage, res: ServerResponse, next: Next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

// Parses a JSON POST body or rejects the request.
export function readGameAgentBody(req: JsonRequest, res: ServerResponse, next: Next) {
  if (req.method === "GET" && req.url?.split("?")[0] === `${GAME_AGENT_API_BASE}/status`) return next();
  if (req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json")) return send(res, 404, { error: "Not found" });
  void readJson(req).then(
    (body) => {
      req.body = body;
      next();
    },
    (error: unknown) => {
      if (!res.headersSent) send(res, 400, { error: clientError(error) });
    },
  );
}

// Reads and parses a JSON object body.
export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("The board image is too large.");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request.");
  return parsed;
}

// True when Origin matches Host or is absent.
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return new URL(origin).host === host;
}
