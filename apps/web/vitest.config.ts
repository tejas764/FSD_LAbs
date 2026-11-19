import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load .env.[mode] (i.e. .env.test) into process.env so that module-level
  // code in lib/env.ts (which calls parseEnv(process.env) at import time)
  // does not throw when test files are collected.
  const env = loadEnv(mode ?? "test", process.cwd(), "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    test: {
      globals: true,
      env,
      projects: [
        {
          // All unit / integration tests — everything except *.a11y.test.tsx
          extends: true,
          test: {
            name: "unit",
            environment: "node",
            include: ["**/*.test.ts", "**/*.test.tsx"],
            exclude: [
              "**/*.a11y.test.tsx",
              "**/postgis.test.ts",
              "node_modules/**",
              "dist/**",
              ".next/**",
            ],
            setupFiles: ["./tests/setup/unit.ts"],
          },
        },
        {
          // Axe accessibility tests only — run via `npm run test:a11y`
          extends: true,
          test: {
            name: "a11y",
            environment: "jsdom",
            include: ["**/*.a11y.test.tsx"],
            passWithNoTests: true,
            setupFiles: ["./tests/setup/a11y.ts"],
          },
        },
      ],
    },
  };
});
