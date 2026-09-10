import type { IncomingMessage, ServerResponse } from "node:http";

export const MAX_BODY_BYTES = 850000;
export const MAX_IMAGE_CHARS = 800000;
const JPEG = /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("The board image is too large.");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid request.");
  return parsed;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return new URL(origin).host === host;
}

export function validateSnapshot(
  input: Record<string, unknown>,
): asserts input is Record<string, unknown> & {
  image: string;
  requestId: string;
} {
  if (
    typeof input.image !== "string" ||
    input.image.length > MAX_IMAGE_CHARS ||
    !JPEG.test(input.image) ||
    !isUuid(input.requestId)
  )
    throw new Error("Send a JPEG snapshot of the board.");
}
