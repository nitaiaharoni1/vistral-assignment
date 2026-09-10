import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const shared = fileURLToPath(new URL("./shared", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@shared": shared },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@shared": shared } },
        test: {
          name: "backend",
          environment: "node",
          include: ["shared/**/*.test.ts", "apps/backend/**/*.test.ts", "tests/unit/backend/**/*.test.ts"],
          setupFiles: ["tests/setup/backend.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { "@shared": shared } },
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["apps/frontend/**/*.test.ts", "apps/frontend/**/*.test.tsx", "tests/unit/frontend/**/*.test.ts"],
          setupFiles: ["tests/setup/frontend.ts"],
        },
      },
    ],
  },
});
