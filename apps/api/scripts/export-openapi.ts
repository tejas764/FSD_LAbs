/**
 * Export the live OpenAPI document (generated from @Api* decorators) to
 * docs/openapi.yaml so the file stays in sync with the implementation.
 *
 * Usage:
 *   npm run openapi:export
 *
 * Run this script whenever you add or change @Api* decorators, then commit
 * the updated docs/openapi.yaml alongside your code change.
 *
 * In CI, run the script and fail if docs/openapi.yaml has uncommitted changes:
 *   npm run openapi:export && git diff --exit-code docs/openapi.yaml
 */
import "reflect-metadata";

import * as fs from "fs";
import * as path from "path";

import { NestFactory } from "@nestjs/core";
import * as yaml from "js-yaml";

import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/main";

async function main(): Promise<void> {
  // Bootstrap the application without starting the HTTP listener.
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");

  const document = buildOpenApiDocument(app);

  await app.close();

  const outPath = path.resolve(__dirname, "../../../docs/openapi.yaml");
  const header =
    "# AUTO-GENERATED — do not edit by hand.\n" +
    "# Source of truth: @Api* decorators in apps/api/src/\n" +
    "# Regenerate: cd apps/api && npm run openapi:export\n\n";

  fs.writeFileSync(outPath, header + yaml.dump(document, { lineWidth: 120 }), "utf8");
  console.log(`openapi.yaml written → ${outPath}`);
}

main().catch((err: unknown) => {
  console.error("export-openapi failed:", err);
  process.exit(1);
});
