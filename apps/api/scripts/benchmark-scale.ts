import "reflect-metadata";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { PressingNeed, type Prisma } from "@prisma/client";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

type BenchmarkTarget = 50000 | 250000 | 500000;

type MetricName = "reports.list" | "analytics.hotspots";

type Measurement = {
  elapsedMs: number;
  status: number;
};

type MetricSummary = {
  name: MetricName;
  runs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  failures: number;
};

const VALID_TARGETS: BenchmarkTarget[] = [50000, 250000, 500000];
const DEFAULT_RUNS = 5;
const BATCH_SIZE = 1000;

const DEFAULT_CONFIG: Record<string, string | number> = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://crisismap:crisismap@localhost:5432/crisismap",
  BETTER_AUTH_SECRET: "benchmark-auth-secret",
  BETTER_AUTH_JWT_ISSUER: "crisismap-benchmark",
  BETTER_AUTH_JWT_AUDIENCE: "crisismap-admin",
  RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE: 30,
  RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE: 30,
  REDIS_DB: 1,
  AI_CLASSIFICATION_ADAPTER: "mock",
};

function parseArgs() {
  const countArg = Number(process.argv[2] ?? "50000");
  const runsArg = Number(process.argv[3] ?? String(DEFAULT_RUNS));

  if (!VALID_TARGETS.includes(countArg as BenchmarkTarget)) {
    throw new Error(`Unsupported target count: ${countArg}. Use one of ${VALID_TARGETS.join(", ")}.`);
  }

  if (!Number.isInteger(runsArg) || runsArg < 1) {
    throw new Error(`Invalid run count: ${runsArg}. Use a positive integer.`);
  }

  return {
    reportCount: countArg as BenchmarkTarget,
    runs: runsArg,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarize(name: MetricName, measurements: Measurement[]): MetricSummary {
  const elapsed = measurements.map((item) => item.elapsedMs);
  const failures = measurements.filter((item) => item.status !== 200).length;

  return {
    name,
    runs: measurements.length,
    p50Ms: percentile(elapsed, 0.5),
    p95Ms: percentile(elapsed, 0.95),
    minMs: Math.min(...elapsed),
    maxMs: Math.max(...elapsed),
    failures,
  };
}

function createRows(crisisId: string, offset: number, count: number, now: number): Prisma.ReportCreateManyInput[] {
  return Array.from({ length: count }, (_, index) => {
    const item = offset + index;
    return {
      id: `benchmark-${now}-${item}`,
      crisisId,
      damageLevel: "PARTIAL",
      infraType: "RESIDENTIAL",
      infraName: `Benchmark ${item}`,
      crisisType: "EARTHQUAKE",
      hasDebris: false,
      collectedAt: new Date(now - item * 1000),
      description: "benchmark report",
      electricityCondition: "SEVERE_DAMAGE",
      healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
      pressingNeeds: [PressingNeed.FOOD_WATER],
      extraFields: {},
      latitude: 36.2 + item * 0.000001,
      longitude: 36.16 + item * 0.000001,
      isDuplicate: false,
      version: 1,
      submittedAt: new Date(now - item * 1000),
    };
  });
}

async function createBenchmarkApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string, defaultValue?: unknown) =>
        key in DEFAULT_CONFIG ? DEFAULT_CONFIG[key] : defaultValue,
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  await app.init();

  return {
    app,
    prisma: moduleRef.get(PrismaService),
  };
}

async function seedReports(prisma: PrismaService, crisisId: string, reportCount: number): Promise<void> {
  const now = Date.now();
  let inserted = 0;

  for (let offset = 0; offset < reportCount; offset += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, reportCount - offset);
    const rows = createRows(crisisId, offset, count, now);
    await prisma.report.createMany({ data: rows });
    inserted += count;

    if (inserted % 50_000 === 0 || inserted === reportCount) {
      console.log(`Seed progress: ${inserted}/${reportCount}`);
    }
  }
}

async function cleanup(prisma: PrismaService, crisisId: string): Promise<void> {
  const reportIds = await prisma.report.findMany({
    where: { crisisId },
    select: { id: true },
  });

  if (reportIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        reportId: {
          in: reportIds.map((report) => report.id),
        },
      },
    });
  }

  await prisma.report.deleteMany({ where: { crisisId } });
  await prisma.crisis.deleteMany({ where: { id: crisisId } });
}

async function measure(app: INestApplication, path: string, runs: number): Promise<Measurement[]> {
  const measurements: Measurement[] = [];

  // Warm-up: prime DB/cache/JIT so timed runs reflect steady-state behavior.
  await request(app.getHttpServer()).get(path);

  for (let run = 0; run < runs; run += 1) {
    const startedAt = Date.now();
    const response = await request(app.getHttpServer()).get(path);
    measurements.push({
      elapsedMs: Date.now() - startedAt,
      status: response.status,
    });
  }

  return measurements;
}

async function main() {
  const { reportCount, runs } = parseArgs();
  const { app, prisma } = await createBenchmarkApp();

  const crisis = await prisma.crisis.create({
    data: {
      name: `Benchmark Crisis ${reportCount}`,
      type: "EARTHQUAKE",
      country: "Syria",
      startedAt: new Date("2026-01-01"),
    },
  });

  try {
    console.log(`Seeding ${reportCount} reports in batches of ${BATCH_SIZE}...`);
    await seedReports(prisma, crisis.id, reportCount);

    const reportsMeasurements = await measure(
      app,
      `/api/v1/reports?crisisId=${crisis.id}`,
      runs,
    );
    const hotspotsMeasurements = await measure(
      app,
      `/api/v1/analytics/hotspots?crisisId=${crisis.id}`,
      runs,
    );

    const results = [
      summarize("reports.list", reportsMeasurements),
      summarize("analytics.hotspots", hotspotsMeasurements),
    ];

    console.log(JSON.stringify({ reportCount, runs, results }, null, 2));
  } finally {
    await cleanup(prisma, crisis.id);
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});