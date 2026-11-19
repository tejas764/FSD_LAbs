#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import * as path from "path";
import { spawnSync } from "child_process";

// Load environment from apps/api/.env.local
// Script is at apps/api/scripts/, so go up 1 level to apps/api
const envPath = path.resolve(__dirname, "../.env.local");
const result = dotenv.config({ path: envPath });

if (result.error && result.error.code !== "ENOENT") {
  console.error(`Failed to load .env.local from ${envPath}:`, result.error);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(`DATABASE_URL not set. Make sure ${envPath} contains DATABASE_URL`);
  process.exit(1);
}

// Run prisma migrate reset
console.log("Running prisma migrate reset...");
const apiRoot = path.resolve(__dirname, "..");
const resetResult = spawnSync("npx", ["prisma", "migrate", "reset", "--force"], {
  cwd: apiRoot,
  stdio: "inherit",
  env: process.env,
});

if (resetResult.error || resetResult.status !== 0) {
  console.error("prisma migrate reset failed");
  process.exit(resetResult.status || 1);
}

// Run seed
console.log("Running seed...");
const seedResult = spawnSync("npm", ["run", "seed"], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
});

if (seedResult.error || seedResult.status !== 0) {
  console.error("seed failed");
  process.exit(seedResult.status || 1);
}

console.log("✓ Database reset and seeded successfully");
