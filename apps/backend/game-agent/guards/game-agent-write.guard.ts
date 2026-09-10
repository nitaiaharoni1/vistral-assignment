import { HttpException } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { CanActivate } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { sameOrigin } from "../../common/http/http";

@Injectable()
export class GameAgentWriteGuard implements CanActivate {
  // Allows GET, and same-origin writes when a key is set.
  public canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    if (req.method === "GET") return true;
    if (!sameOrigin(req)) throw new HttpException({ error: "Use the app to check your board." }, 403);
    if (!process.env.OPENROUTER_API_KEY) throw new HttpException({ error: "The board reader is not configured yet." }, 503);
    return true;
  }
}
