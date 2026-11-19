import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "prisma/config";

// Load .env.local from apps/api/ (where this config lives)
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
