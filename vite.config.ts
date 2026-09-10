import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { GAME_AGENT_API_BASE } from "./shared/game-agent-protocol/game-agent-api.ts";

const repo = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // The agent reads AGENT_PORT from .env.local; the proxy follows the same file.
  const agentPort = loadEnv(mode, repo, "").AGENT_PORT || "4174";
  const proxy = { [GAME_AGENT_API_BASE]: `http://127.0.0.1:${agentPort}` };
  return {
    root: fileURLToPath(new URL("./apps/frontend", import.meta.url)),
    envDir: repo,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) },
    },
    build: {
      outDir: fileURLToPath(new URL("./dist", import.meta.url)),
      emptyOutDir: true,
    },
    server: {
      proxy,
      fs: {
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.paperplay/**", "**/backend/**"],
        allow: [repo],
      },
    },
    preview: { proxy },
  };
});
