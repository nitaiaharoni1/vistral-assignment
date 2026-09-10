import "reflect-metadata";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { jsonHeaders } from "./common/http/http";
import { readGameAgentBody } from "./common/http/http";

export { resetSessionCreations } from "./game-agent/services/game-agent/game-agent.service";

// Builds the Nest app with JSON middleware.
export async function createGameAgentApp() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: false,
  });
  app.use(jsonHeaders);
  app.use(readGameAgentBody);
  return app;
}

// Listens on a local port and sets a request timeout.
export async function bindGameAgent(app: INestApplication, port: number) {
  await app.listen(port, "127.0.0.1");
  const server = app.getHttpServer() as Server;
  server.requestTimeout = 30000;
  return server;
}

// Starts the agent on AGENT_PORT or 4174.
export async function listenGameAgent(app?: INestApplication) {
  const nest = app ?? (await createGameAgentApp());
  const server = await bindGameAgent(nest, Number(process.env.AGENT_PORT || 4174));
  const bound = (server.address() as AddressInfo).port;
  process.stdout.write(`Paperplay agent listening on 127.0.0.1:${bound}\n`);
  return nest;
}

// True when this file is the process entry point.
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) void listenGameAgent();
