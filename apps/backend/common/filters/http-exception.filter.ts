import { Catch } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { clientError } from "../http/http";
import { send } from "../http/http";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  // Writes a JSON error unless the response already started.
  public catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<ServerResponse>();
    if (res.headersSent) return;
    const { status, message } = replyOf(error);
    send(res, status, { error: message });
  }
}

// Maps an error to an HTTP status and message.
function replyOf(error: unknown): { status: number; message: string } {
  if (!(error instanceof HttpException)) return { status: 400, message: clientError(error) };
  const status = error.getStatus();
  if (status === 404) return { status, message: "Not found" };
  return { status, message: messageOf(error.getResponse()) };
}

// Reads a string or error field from an exception payload.
function messageOf(payload: string | object): string {
  if (typeof payload === "string") return payload;
  if (hasErrorField(payload)) return payload.error;
  return "The board reader returned an invalid response. Try again.";
}

// True when the payload has a string error field.
function hasErrorField(payload: object): payload is { error: string } {
  return "error" in payload && typeof payload.error === "string";
}
