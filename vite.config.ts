import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const repo = fileURLToPath(new URL(".", import.meta.url));
const proxy = { "/api/agent": "http://127.0.0.1:4174" };
export default defineConfig({
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
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.paperplay/**",
        "**/backend/**",
      ],
      allow: [repo],
    },
  },
  preview: { proxy },
});
